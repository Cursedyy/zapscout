/**
 * Server functions de sincronização entre o store local (localStorage)
 * e o Lovable Cloud. Chamadas em fire-and-forget pelo store nos momentos-chave
 * (adicionar lead, iniciar cadência, parar, marcar status, criar campanha).
 *
 * O lead local tem `id` string (vindo do mock do Google Maps).
 * No Supabase usamos `lead_external_id` para mapear; `id` é UUID gerado.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LeadPayload = z.object({
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
type LeadPayloadT = z.infer<typeof LeadPayload>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureLead(
  supabase: any,
  userId: string,
  payload: LeadPayloadT,
): Promise<string> {
  // upsert por (user_id, lead_external_id)
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("user_id", userId)
    .eq("lead_external_id", payload.externalId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      user_id: userId,
      lead_external_id: payload.externalId,
      nome_empresa: payload.nome,
      telefone: payload.telefone ?? null,
      whatsapp: payload.whatsapp ?? payload.telefone ?? null,
      cidade: payload.cidade ?? null,
      estado: payload.estado ?? null,
      endereco: payload.endereco ?? null,
      nicho: payload.nicho ?? null,
      segmento: payload.nicho ?? null,
      categoria: payload.categoria ?? null,
      tem_site: payload.temSite ?? false,
      site_url: payload.siteUrl ?? null,
      avaliacao: payload.avaliacao ?? null,
      total_avaliacoes: payload.totalAvaliacoes ?? 0,
      link_maps: payload.linkMaps ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Sobe (upsert) um lead. */
export const syncLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(LeadPayload)
  .handler(async ({ data, context }) => {
    const id = await ensureLead(context.supabase, context.userId, data);
    return { id };
  });

/** Inicia cadência automática do lead (cria/atualiza sequence_state). */
export const startLeadSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      lead: LeadPayload,
      templateMensagem: z.string().min(1).max(4096),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const leadId = await ensureLead(supabase, userId, data.lead);
    const sequenceState = {
      enabled: true,
      startedAt: new Date().toISOString(),
      templateMensagem: data.templateMensagem,
      sentSteps: [] as { step: number; ts: string }[],
    };
    const { error } = await supabase
      .from("leads")
      .update({ sequence_state: sequenceState })
      .eq("id", leadId);
    if (error) throw new Error(error.message);
    return { leadId };
  });

/** Para cadência. */
export const stopLeadSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      externalId: z.string().min(1),
      reason: z.enum(["respondeu", "manual", "concluida"]).default("manual"),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead } = await supabase
      .from("leads")
      .select("id, sequence_state")
      .eq("user_id", userId)
      .eq("lead_external_id", data.externalId)
      .maybeSingle();
    if (!lead?.id) return { ok: false };
    const seq = ((lead.sequence_state as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const updated = { ...seq, enabled: false, stoppedAt: new Date().toISOString(), stoppedReason: data.reason };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("leads").update({ sequence_state: updated as any }).eq("id", lead.id);
    return { ok: true };
  });

/** Atualiza status do lead. */
export const updateLeadStatusRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      externalId: z.string().min(1),
      status: z.enum(["novo", "contatado", "respondeu", "negociacao", "fechado", "perdido"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("leads")
      .update({ status: data.status })
      .eq("user_id", userId)
      .eq("lead_external_id", data.externalId);
    return { ok: true };
  });

/** Cria campanha no Supabase a partir do payload local (leads já devem existir via syncLead). */
export const createCampaignRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      nome: z.string().min(1).max(255),
      mensagem: z.string().min(1).max(4096),
      limitePorHora: z.number().int().min(1).max(120),
      agendamento: z.string().datetime().optional().nullable(),
      filtros: z.record(z.string(), z.unknown()).optional(),
      leadExternalIds: z.array(z.string().min(1)).min(1).max(5000),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve external IDs → UUIDs
    const { data: rows } = await supabase
      .from("leads")
      .select("id, lead_external_id, whatsapp, telefone, nome_empresa")
      .eq("user_id", userId)
      .in("lead_external_id", data.leadExternalIds);

    const items = (rows ?? []).map((r) => ({
      leadId: r.id,
      externalId: r.lead_external_id,
      numero: r.whatsapp || r.telefone,
      nome: r.nome_empresa,
      status: "pendente" as const,
    }));

    const status = data.agendamento ? "agendada" : "em_andamento";

    const { data: camp, error } = await supabase
      .from("campanhas")
      .insert({
        user_id: userId,
        nome: data.nome,
        mensagem: data.mensagem,
        mensagem_override: data.mensagem,
        limite_por_hora: data.limitePorHora,
        agendamento: data.agendamento ?? null,
        filtros: data.filtros ?? {},
        items,
        status,
        started_at: status === "em_andamento" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: camp.id as string, totalItems: items.length };
  });
