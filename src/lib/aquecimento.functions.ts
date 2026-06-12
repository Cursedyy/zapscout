import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIAS = z.array(z.number().int().min(0).max(6)).min(1).max(7);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().max(40).optional().nullable(),
  ativo: z.boolean(),
  numero_destino: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\s()-]*$/, "Número inválido")
    .optional()
    .nullable(),
  duracao_dias: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  intensidade: z.enum(["suave", "moderado", "agressivo"]),
  tipo_mensagem: z.enum(["casual", "profissional", "misto"]),
  horario_inicio: z.string().regex(TIME_RE),
  horario_fim: z.string().regex(TIME_RE),
  dias_semana: DIAS,
});

export const listAquecimentoChips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("aquecimento_chips")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAquecimentoChip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const onlyDigits = (data.numero_destino ?? "").replace(/\D/g, "");
    if (data.ativo && onlyDigits.length < 10) {
      throw new Error("Informe um número de destino válido (com DDD).");
    }
    if (data.horario_fim <= data.horario_inicio) {
      throw new Error("Horário final deve ser maior que o inicial.");
    }

    const existing = data.id
      ? (
          await context.supabase
            .from("aquecimento_chips")
            .select("*")
            .eq("id", data.id)
            .eq("user_id", context.userId)
            .maybeSingle()
        ).data
      : null;

    const ativando = data.ativo && !existing?.ativo;
    const trocouDuracao =
      existing?.duracao_dias && existing.duracao_dias !== data.duracao_dias;
    const resetar = ativando || (data.ativo && !!trocouDuracao);

    const payload = {
      user_id: context.userId,
      nome: data.nome ?? null,
      ativo: data.ativo,
      numero_destino: onlyDigits || null,
      duracao_dias: data.duracao_dias,
      intensidade: data.intensidade,
      tipo_mensagem: data.tipo_mensagem,
      horario_inicio: data.horario_inicio,
      horario_fim: data.horario_fim,
      dias_semana: data.dias_semana,
      status: data.ativo ? "aquecendo" : "pausado",
      iniciado_em: resetar
        ? new Date().toISOString()
        : existing?.iniciado_em ?? (data.ativo ? new Date().toISOString() : null),
      dia_referencia: resetar
        ? new Date().toISOString().slice(0, 10)
        : existing?.dia_referencia ??
          (data.ativo ? new Date().toISOString().slice(0, 10) : null),
      mensagens_hoje: resetar ? 0 : existing?.mensagens_hoje ?? 0,
      proximo_envio_em: resetar ? null : existing?.proximo_envio_em ?? null,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("aquecimento_chips")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    // Limite de 5 (também enforçado por trigger)
    const { count } = await context.supabase
      .from("aquecimento_chips")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) >= 5) {
      throw new Error("Limite de 5 chips de aquecimento atingido.");
    }

    const { data: inserted, error } = await context.supabase
      .from("aquecimento_chips")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteAquecimentoChip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("aquecimento_chips")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleAquecimentoChip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("aquecimento_chips")
      .update({
        ativo: data.ativo,
        status: data.ativo ? "aquecendo" : "pausado",
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Histórico dos últimos 7 dias agrupado por chip. */
export const getHistorico7Dias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("mensagens_enviadas")
      .select("chip_id, enviado_em")
      .eq("user_id", context.userId)
      .not("chip_id", "is", null)
      .gte("enviado_em", desde)
      .limit(5000);
    if (error) throw new Error(error.message);

    // Agrupa: { [chip_id]: { [YYYY-MM-DD]: count } }
    const out: Record<string, Record<string, number>> = {};
    for (const r of data ?? []) {
      const cid = r.chip_id as string;
      const dia = (r.enviado_em as string).slice(0, 10);
      out[cid] ??= {};
      out[cid][dia] = (out[cid][dia] ?? 0) + 1;
    }
    return out;
  });
