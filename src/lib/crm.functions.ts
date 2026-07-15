/**
 * Server functions de leitura/escrita de leads e campanhas no Lovable Cloud.
 * Mantém a forma do CrmLead/Campanha esperada pelo store local
 * (id = UUID do row; lead_external_id = id original do mock/Maps).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StatusEnum = z.enum(["novo", "contatado", "respondeu", "negociacao", "fechado", "perdido", "sem_numero"]);

/* ============================== LEADS ============================== */

export const listLeadsRemote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const UpsertLeadInput = z.object({
  externalId: z.string().min(1).max(120),
  nome: z.string().min(1).max(255),
  telefone: z.string().max(40).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  cidade: z.string().max(120).optional().nullable(),
  estado: z.string().max(40).optional().nullable(),
  endereco: z.string().max(255).optional().nullable(),
  nicho: z.string().max(120).optional().nullable(),
  categoria: z.string().max(120).optional().nullable(),
  temSite: z.boolean().optional(),
  siteUrl: z.string().max(500).optional().nullable(),
  avaliacao: z.number().nullable().optional(),
  totalAvaliacoes: z.number().int().nullable().optional(),
  linkMaps: z.string().max(500).optional().nullable(),
});

export const upsertLeadRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(UpsertLeadInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_external_id", data.externalId)
      .maybeSingle();
    if (existing) return { row: existing, created: false };

    const now = Date.now();
    const semNumero = !((data.telefone ?? "").trim()) && !((data.whatsapp ?? "").trim());
    const statusInicial: "novo" | "sem_numero" = semNumero ? "sem_numero" : "novo";
    const historyInicial = semNumero
      ? [{ ts: now, text: "Adicionado ao CRM — sem número de telefone" }]
      : [{ ts: now, text: "Adicionado ao CRM" }];
    const { data: row, error } = await supabase
      .from("leads")
      .insert({
        user_id: userId,
        lead_external_id: data.externalId,
        nome_empresa: data.nome,
        telefone: data.telefone ?? null,
        whatsapp: data.whatsapp ?? data.telefone ?? null,
        cidade: data.cidade ?? null,
        estado: data.estado ?? null,
        endereco: data.endereco ?? null,
        nicho: data.nicho ?? null,
        segmento: data.nicho ?? null,
        categoria: data.categoria ?? null,
        tem_site: data.temSite ?? false,
        site_url: data.siteUrl ?? null,
        avaliacao: data.avaliacao ?? null,
        total_avaliacoes: data.totalAvaliacoes ?? 0,
        link_maps: data.linkMaps ?? null,
        status: statusInicial,
        notes: "",
        history: historyInicial,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { row, created: true };
  });


export const updateLeadRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: StatusEnum.optional(),
      notes: z.string().max(8000).optional(),
      follow_up_at: z.string().datetime().nullable().optional(),
      history: z.array(z.object({ ts: z.union([z.number(), z.string()]), text: z.string().max(500) })).optional(),
      valor_fechado: z.number().min(0).max(99999999).nullable().optional(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sequence_state: z.any().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.follow_up_at !== undefined) patch.follow_up_at = data.follow_up_at;
    if (data.history !== undefined) {
      patch.history = data.history.map((h) => ({
        ts: typeof h.ts === "number" ? h.ts : new Date(h.ts).getTime(),
        text: h.text,
      }));
    }
    if (data.valor_fechado !== undefined) patch.valor_fechado = data.valor_fechado;
    if (data.sequence_state !== undefined) patch.sequence_state = data.sequence_state;
    const { data: rows, error } = await supabase
      .from("leads")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) {
      console.error(`[updateLeadRemote] erro Supabase — lead ${data.id}:`, error.message);
      throw new Error(error.message);
    }
    if (!rows || rows.length === 0) {
      console.error(`[updateLeadRemote] 0 linhas atualizadas — lead ${data.id}, user ${userId}. RLS ou lead inexistente.`);
      throw new Error("O lead não foi atualizado no banco (verifique permissões).");
    }
    return { ok: true, updated: rows.length };
  });

/**
 * Bulk update de status em lotes de 20 IDs por query.
 * Retorna a contagem de linhas efetivamente atualizadas no banco,
 * por lote, para que o cliente possa detectar falhas silenciosas.
 */
export const bulkUpdateLeadStatusRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(2000),
      status: StatusEnum,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const BATCH = 20;
    let updated = 0;
    const errors: string[] = [];
    for (let i = 0; i < data.ids.length; i += BATCH) {
      const slice = data.ids.slice(i, i + BATCH);
      const { data: rows, error } = await supabase
        .from("leads")
        .update({ status: data.status } as never)
        .eq("user_id", userId)
        .in("id", slice)
        .select("id");
      if (error) {
        errors.push(error.message);
        continue;
      }
      updated += rows?.length ?? 0;
    }
    if (errors.length > 0) {
      throw new Error(`Falha em ${errors.length} lote(s): ${errors[0]}`);
    }
    if (updated !== data.ids.length) {
      throw new Error(`Apenas ${updated} de ${data.ids.length} leads foram atualizados (verifique permissões).`);
    }
    return { ok: true, updated };
  });

export const deleteLeadRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ CAMPANHAS ============================ */

export const listCampanhasRemote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("campanhas")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CampanhaItemSchema = z.object({
  leadId: z.string().min(1).max(120),
  numero: z.string().optional(),
  status: z.enum(["pendente", "enviado", "falha", "pulado"]),
  sentAt: z.number().optional(),
  attempts: z.number().int().min(0).optional(),
  nextRetryAt: z.string().optional(),
  lastError: z.string().max(500).optional(),
});


const StatusCampanhaEnum = z.enum(["rascunho", "agendada", "em_andamento", "pausada", "concluida"]);

export const createCampanhaRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      nome: z.string().min(1).max(255),
      templateId: z.string().min(1).max(120),
      mensagem: z.string().min(1).max(4096),
      mensagemOverride: z.string().max(4096).optional(),
      filtroNicho: z.string().max(120).default(""),
      filtroCidade: z.string().max(120).default(""),
      apenasSemSite: z.boolean().default(false),
      apenasStatusNovo: z.boolean().default(false),
      limitePorHora: z.number().int().min(1).max(120),
      agendamento: z.number().int().optional(),
      items: z.array(CampanhaItemSchema).min(1).max(5000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const status = data.agendamento ? "agendada" : "rascunho";

    // Resolve o número de cada lead no server, na criação — não no dispatch.
    // O client (app.campanhas.nova.tsx) não manda numero nos items; sem isso
    // item.numero fica sempre vazio e process-campaigns.ts aborta todo envio
    // com "Lead sem número cadastrado", mesmo leads com telefone/whatsapp ok.
    const leadIds = [...new Set(data.items.map((it) => it.leadId))];
    const { data: leadsRows, error: leadsError } = await supabase
      .from("leads")
      .select("id, whatsapp, telefone")
      .eq("user_id", userId)
      .in("id", leadIds);
    if (leadsError) throw new Error(leadsError.message);
    const numeroPorLead = new Map(
      (leadsRows ?? []).map((l) => [l.id as string, (l.whatsapp || l.telefone || "") as string]),
    );
    const itemsComNumero = data.items.map((it) => ({
      ...it,
      numero: it.numero || numeroPorLead.get(it.leadId) || "",
    }));

    const { data: row, error } = await supabase
      .from("campanhas")
      .insert({
        user_id: userId,
        nome: data.nome,
        mensagem: data.mensagem,
        mensagem_override: data.mensagemOverride ?? null,
        template_id: null,
        limite_por_hora: data.limitePorHora,
        intervalo_segundos: Math.max(1, Math.floor(3600 / data.limitePorHora)),
        agendamento: data.agendamento ? new Date(data.agendamento).toISOString() : null,
        status,
        items: itemsComNumero as never,
        filtros: {
          templateId: data.templateId,
          filtroNicho: data.filtroNicho,
          filtroCidade: data.filtroCidade,
          apenasSemSite: data.apenasSemSite,
          apenasStatusNovo: data.apenasStatusNovo,
        } as never,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { row };
  });

export const updateCampanhaRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: StatusCampanhaEnum.optional(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: z.array(CampanhaItemSchema).optional(),
      started_at: z.string().datetime().nullable().optional(),
      last_sent_at: z.string().datetime().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.items !== undefined) patch.items = data.items;
    if (data.started_at !== undefined) patch.started_at = data.started_at;
    if (data.last_sent_at !== undefined) patch.last_sent_at = data.last_sent_at;
    const { error } = await supabase
      .from("campanhas")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampanhaRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("campanhas").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ======================== DISPATCH LOGS (histórico de disparos) ======================== */

export const listDispatchLogsRemote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      campanhaId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("campanha_dispatch_logs")
      .select(
        "id, campanha_id, campanha_nome, lead_id, lead_nome, numero, started_at, finished_at, duration_ms, status, attempt, http_status, error_message",
      )
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.campanhaId) query = query.eq("campanha_id", data.campanhaId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCronRunsRemote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ limit: z.number().int().min(1).max(200).optional() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("campanha_cron_runs")
      .select(
        "id, started_at, finished_at, duration_ms, campanhas_consideradas, campanhas_iniciadas, leads_selecionados, mensagens_enviadas, concluidas, pulados, erros, detalhes, ok, error_message",
      )
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Último "problema" registrado por campanha (falha, pausa, atraso ou
 * ausência de número) segundo os dispatch logs do próprio usuário.
 * Serve para o card da campanha mostrar rapidamente o motivo do último
 * tick que não conseguiu enviar.
 *
 * Escaneamos os últimos 500 logs não-"enviado" e reduzimos por campanha:
 * como já vêm ordenados por `started_at desc`, o primeiro encontrado é
 * o mais recente.
 */
export type CampanhaUltimaFalha = {
  campanha_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  attempt: number | null;
  http_status: number | null;
  error_message: string | null;
  lead_nome: string | null;
};

const PROBLEMA_STATUSES = [
  "falha",
  "sem_whatsapp",
  "sem_numero",
  "pausada_auth",
  "pausada_rate_limit",
  "retry_agendado",
  "ja_prospectado",
];

export const listUltimasFalhasPorCampanhaRemote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampanhaUltimaFalha[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("campanha_dispatch_logs")
      .select(
        "campanha_id, lead_nome, started_at, finished_at, status, attempt, http_status, error_message",
      )
      .eq("user_id", userId)
      .in("status", PROBLEMA_STATUSES)
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const porCampanha = new Map<string, CampanhaUltimaFalha>();
    for (const r of rows ?? []) {
      if (!r.campanha_id || porCampanha.has(r.campanha_id)) continue;
      porCampanha.set(r.campanha_id, {
        campanha_id: r.campanha_id,
        status: r.status,
        started_at: r.started_at,
        finished_at: r.finished_at,
        attempt: r.attempt ?? null,
        http_status: r.http_status ?? null,
        error_message: r.error_message ?? null,
        lead_nome: r.lead_nome ?? null,
      });
    }
    return [...porCampanha.values()];
  });
