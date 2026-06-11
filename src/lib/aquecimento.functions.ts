import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveSchema = z.object({
  ativo: z.boolean(),
  numero_destino: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\s()-]*$/, "Número inválido")
    .optional()
    .nullable(),
  duracao_dias: z.union([z.literal(7), z.literal(14), z.literal(30)]),
});

export const getAquecimentoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("aquecimento_config")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const saveAquecimentoConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const onlyDigits = (data.numero_destino ?? "").replace(/\D/g, "");
    if (data.ativo && onlyDigits.length < 10) {
      throw new Error("Informe um número de destino válido (com DDD).");
    }

    const { data: existing } = await context.supabase
      .from("aquecimento_config")
      .select("ativo, iniciado_em, dia_referencia, duracao_dias")
      .eq("user_id", context.userId)
      .maybeSingle();

    const ativando = data.ativo && !existing?.ativo;
    const trocouDuracao =
      existing?.duracao_dias && existing.duracao_dias !== data.duracao_dias;

    const payload = {
      user_id: context.userId,
      ativo: data.ativo,
      numero_destino: onlyDigits || null,
      duracao_dias: data.duracao_dias,
      iniciado_em:
        ativando || (data.ativo && trocouDuracao)
          ? new Date().toISOString()
          : existing?.iniciado_em ?? (data.ativo ? new Date().toISOString() : null),
      dia_referencia:
        ativando || (data.ativo && trocouDuracao)
          ? new Date().toISOString().slice(0, 10)
          : existing?.dia_referencia ?? (data.ativo ? new Date().toISOString().slice(0, 10) : null),
      mensagens_hoje: ativando || (data.ativo && trocouDuracao) ? 0 : undefined,
    };

    const { error } = await context.supabase
      .from("aquecimento_config")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
