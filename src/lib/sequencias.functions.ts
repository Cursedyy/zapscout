import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// supabaseAdmin é importado dinamicamente nos handlers para evitar leak no client bundle
import { uazSendText } from "./uazapi.server";

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

const etapaSchema = z.object({
  ordem: z.number().int().min(1).max(20),
  intervalo: z.number().int().min(0).max(365),
  unidade: z.enum(["horas", "dias"]),
  mensagem: z.string().min(1).max(4096),
});

const sequenciaInput = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1).max(120),
  objetivo: z.enum(["vender_site", "vender_automacao", "reuniao", "outro"]).default("outro"),
  ativa: z.boolean().default(true),
  parar_ao_responder: z.boolean().default(true),
  parar_ao_fechar: z.boolean().default(true),
  parar_ao_mover_crm: z.boolean().default(false),
  etapas: z.array(etapaSchema).min(1).max(20),
});

export type SequenciaEtapa = z.infer<typeof etapaSchema>;
export type SequenciaInput = z.infer<typeof sequenciaInput>;

export type SequenciaRow = {
  id: string;
  user_id: string;
  nome: string;
  objetivo: string;
  ativa: boolean;
  parar_ao_responder: boolean;
  parar_ao_fechar: boolean;
  parar_ao_mover_crm: boolean;
  etapas: SequenciaEtapa[];
  created_at: string;
  updated_at: string;
};

export type ExecucaoEtapa = {
  ordem: number;
  status: "pendente" | "enviada" | "falha";
  agendada_para: string;
  enviada_em?: string;
};

export type ExecucaoRow = {
  id: string;
  user_id: string;
  sequencia_id: string;
  lead_id: string;
  etapa_atual: number;
  etapas: ExecucaoEtapa[];
  pausada: boolean;
  cancelada: boolean;
  parada_por_resposta: boolean;
  concluida: boolean;
  started_at: string;
};

function calcularAgendamento(etapas: SequenciaEtapa[], startedAt: number): ExecucaoEtapa[] {
  let acumulado = 0;
  return etapas
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => {
      acumulado += (e.unidade === "dias" ? DIA_MS : HORA_MS) * e.intervalo;
      return {
        ordem: e.ordem,
        status: "pendente" as const,
        agendada_para: new Date(startedAt + acumulado).toISOString(),
      };
    });
}

function renderVars(template: string, lead: Record<string, unknown>): string {
  const vars: Record<string, string> = {
    nome: String(lead.nome_empresa ?? ""),
    empresa: String(lead.nome_empresa ?? ""),
    cidade: String(lead.cidade ?? ""),
    nicho: String(lead.nicho ?? lead.segmento ?? ""),
    avaliacao: lead.avaliacao != null ? String(lead.avaliacao) : "—",
    telefone: String(lead.telefone ?? lead.whatsapp ?? ""),
    endereco: String(lead.endereco ?? ""),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

// =========================================================================
// CRUD de Sequências
// =========================================================================

export const listSequencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await (
      supabase as never as {
        from: (t: string) => {
          select: (q: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => Promise<{ data: SequenciaRow[] | null; error: { message: string } | null }>;
          };
        };
      }
    )
      .from("sequencias")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sequencias: (data ?? []) as SequenciaRow[] };
  });

export const upsertSequencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sequenciaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const payload = {
      user_id: userId,
      nome: data.nome,
      objetivo: data.objetivo,
      ativa: data.ativa,
      parar_ao_responder: data.parar_ao_responder,
      parar_ao_fechar: data.parar_ao_fechar,
      parar_ao_mover_crm: data.parar_ao_mover_crm,
      etapas: data.etapas as unknown as never,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("sequencias" as never)
        .update(payload as never)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("sequencias" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

export const deleteSequencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("sequencias" as never)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================================
// Execuções
// =========================================================================

export const listExecucoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await (
      supabase as never as {
        from: (t: string) => {
          select: (q: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => Promise<{ data: ExecucaoRow[] | null; error: { message: string } | null }>;
          };
        };
      }
    )
      .from("sequencia_execucoes")
      .select("*")
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { execucoes: (data ?? []) as ExecucaoRow[] };
  });

export const iniciarSequencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sequenciaId: z.string().uuid(),
        leadIds: z.array(z.string().uuid()).min(1).max(500),
        offsetMinutos: z
          .number()
          .int()
          .min(0)
          .max(60 * 24)
          .default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: seq, error: seqErr } = await supabaseAdmin
      .from("sequencias" as never)
      .select("*")
      .eq("id", data.sequenciaId)
      .eq("user_id", userId)
      .single();
    if (seqErr || !seq) throw new Error("Sequência não encontrada");

    const etapasDef = ((seq as unknown as SequenciaRow).etapas ?? []) as SequenciaEtapa[];
    if (etapasDef.length === 0) throw new Error("Sequência sem etapas");

    // Snapshot do status atual de cada lead — usado por parar_ao_mover_crm no
    // cron pra detectar "moveu no CRM" (mudou pra QUALQUER status diferente
    // do inicial), sem precisar reinterpretar "mover" como um status
    // específico. Coluna nova em sequencia_execucoes (ver migration).
    const { data: leadsAtuais } = await supabaseAdmin
      .from("leads")
      .select("id, status")
      .in("id", data.leadIds);
    const statusPorLead = new Map((leadsAtuais ?? []).map((l) => [l.id, l.status as string]));

    const now = Date.now();
    const stride =
      data.leadIds.length > 1 && data.offsetMinutos > 0
        ? (data.offsetMinutos * 60 * 1000) / data.leadIds.length
        : 0;

    const rows = data.leadIds.map((leadId, i) => {
      const startedAt = now + stride * i;
      return {
        user_id: userId,
        sequencia_id: data.sequenciaId,
        lead_id: leadId,
        etapa_atual: 0,
        etapas: calcularAgendamento(etapasDef, startedAt) as unknown as never,
        started_at: new Date(startedAt).toISOString(),
        status_inicial: statusPorLead.get(leadId) ?? null,
      };
    });

    const { error } = await supabaseAdmin
      .from("sequencia_execucoes" as never)
      .insert(rows as never);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const atualizarExecucao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        acao: z.enum(["pausar", "retomar", "cancelar"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const update: Record<string, boolean> = {};
    if (data.acao === "pausar") update.pausada = true;
    else if (data.acao === "retomar") update.pausada = false;
    else update.cancelada = true;

    const { error } = await supabaseAdmin
      .from("sequencia_execucoes" as never)
      .update(update as never)
      .in("id", data.ids)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const contarAgendadosHoje = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await (
      supabase as never as {
        from: (t: string) => {
          select: (q: string) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              eq: (
                c: string,
                v: unknown,
              ) => {
                eq: (
                  c: string,
                  v: unknown,
                ) => Promise<{ data: ExecucaoRow[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      }
    )
      .from("sequencia_execucoes")
      .select("etapas")
      .eq("pausada", false)
      .eq("cancelada", false)
      .eq("concluida", false);
    if (error) throw new Error(error.message);
    const now = Date.now();
    const fimDoDia = new Date();
    fimDoDia.setHours(23, 59, 59, 999);
    const limite = fimDoDia.getTime();
    let total = 0;
    for (const exec of (data ?? []) as unknown as ExecucaoRow[]) {
      for (const et of exec.etapas) {
        if (et.status !== "pendente") continue;
        const t = new Date(et.agendada_para).getTime();
        if (t >= now && t <= limite) total++;
      }
    }
    return { total };
  });

// =========================================================================
// Motor de envio (chamado pelo cron OU pelo client)
// =========================================================================

export const processarVencidos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const now = Date.now();
    const results = { processadas: 0, enviadas: 0, erros: 0, concluidas: 0 };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("uazapi_instance_token, uazapi_instance_status, uazapi_ultimo_ping")
      .eq("id", userId)
      .single();

    const token = profile?.uazapi_instance_token ?? null;
    if (!token) {
      return { ...results, skipped: "whatsapp_desconectado" as const };
    }
    const { estaInstanciaConectada } = await import("./uazapi-resolve.server");
    const conectado = await estaInstanciaConectada({
      userId,
      token,
      statusCache: profile?.uazapi_instance_status ?? null,
      ultimoPing: profile?.uazapi_ultimo_ping ?? null,
    });
    if (!conectado) {
      return { ...results, skipped: "whatsapp_desconectado" as const };
    }

    const { data: execs } = await supabaseAdmin
      .from("sequencia_execucoes" as never)
      .select("*")
      .eq("user_id", userId)
      .eq("pausada", false)
      .eq("cancelada", false)
      .eq("concluida", false);

    const leadIds = (execs as unknown as ExecucaoRow[] | null)?.map((e) => e.lead_id) ?? [];
    if (leadIds.length === 0) return results;

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, nome_empresa, telefone, whatsapp, cidade, nicho, segmento, endereco, avaliacao, status",
      )
      .in("id", leadIds);
    const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

    const { data: seqs } = await supabaseAdmin
      .from("sequencias" as never)
      .select("*")
      .eq("user_id", userId);
    const seqMap = new Map(((seqs as unknown as SequenciaRow[]) ?? []).map((s) => [s.id, s]));

    for (const exec of (execs as unknown as ExecucaoRow[]) ?? []) {
      const lead = leadMap.get(exec.lead_id);
      const seq = seqMap.get(exec.sequencia_id);
      if (!lead || !seq) continue;

      // Auto-stop por status do lead
      if (
        (seq.parar_ao_responder && lead.status === "respondeu") ||
        (seq.parar_ao_fechar && (lead.status === "fechado" || lead.status === "perdido"))
      ) {
        await supabaseAdmin
          .from("sequencia_execucoes" as never)
          .update({ parada_por_resposta: true, concluida: true } as never)
          .eq("id", exec.id);
        continue;
      }

      const proxIdx = exec.etapas.findIndex((e) => e.status === "pendente");
      if (proxIdx < 0) {
        await supabaseAdmin
          .from("sequencia_execucoes" as never)
          .update({ concluida: true } as never)
          .eq("id", exec.id);
        results.concluidas++;
        continue;
      }
      const etapa = exec.etapas[proxIdx];
      if (new Date(etapa.agendada_para).getTime() > now) continue;

      results.processadas++;
      const etapaDef = seq.etapas.find((e) => e.ordem === etapa.ordem);
      if (!etapaDef) continue;
      const texto = renderVars(etapaDef.mensagem, lead as Record<string, unknown>);
      const numero = (lead.whatsapp || lead.telefone || "").toString();
      if (!numero) continue;

      try {
        const r = await uazSendText(token, numero, texto);
        results.enviadas++;
        const novasEtapas = [...exec.etapas];
        novasEtapas[proxIdx] = {
          ...etapa,
          status: "enviada",
          enviada_em: new Date().toISOString(),
        };
        const concluida = !novasEtapas.some((e) => e.status === "pendente");
        await supabaseAdmin
          .from("sequencia_execucoes" as never)
          .update({
            etapas: novasEtapas as unknown as never,
            etapa_atual: proxIdx + 1,
            concluida,
          } as never)
          .eq("id", exec.id);
        if (concluida) results.concluidas++;

        await supabaseAdmin.from("mensagens_enviadas").insert({
          user_id: userId,
          lead_id: lead.id,
          texto,
          step: etapa.ordem,
          status: "enviado",
          uazapi_message_id: r.id ?? null,
        });
      } catch (e) {
        results.erros++;
        console.error("[sequencias] erro envio", exec.id, e);
        const novasEtapas = [...exec.etapas];
        novasEtapas[proxIdx] = { ...etapa, status: "falha" };
        await supabaseAdmin
          .from("sequencia_execucoes" as never)
          .update({ etapas: novasEtapas as unknown as never } as never)
          .eq("id", exec.id);
      }
    }
    return results;
  });
