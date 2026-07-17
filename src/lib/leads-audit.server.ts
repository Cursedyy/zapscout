/**
 * Helper server-only para gravar mudanças automáticas de status de lead
 * na tabela `leads_status_audit`. É best-effort: nunca lança — se o insert
 * falhar, apenas loga (não queremos derrubar o job que fez a mudança).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadAuditOrigem =
  | "cron:process-envios-manuais"
  | "cron:process-followups"
  | "cron:process-campaigns"
  | "ia-vendas"
  | string;

export async function logLeadStatusChange(params: {
  leadId: string;
  userId: string;
  statusAnterior: string | null;
  statusNovo: string;
  origem: LeadAuditOrigem;
  detalhes?: Record<string, unknown>;
}): Promise<void> {
  if (params.statusAnterior === params.statusNovo) return;
  try {
    await supabaseAdmin.from("leads_status_audit" as never).insert({
      lead_id: params.leadId,
      user_id: params.userId,
      status_anterior: params.statusAnterior,
      status_novo: params.statusNovo,
      origem: params.origem,
      detalhes: params.detalhes ?? null,
    } as never);
  } catch (e) {
    console.error("[leads-audit] falha ao gravar log:", e);
  }
}

/**
 * Move `leads.status` para `novoStatus` SOMENTE se o status atual estiver em
 * `permitidoDe` — nunca regride um lead que já avançou (ex.: não volta
 * "negociacao"/"fechado"/"perdido" para "respondeu"). Centraliza a regra que
 * antes estava duplicada (e divergente) em cada cron/webhook.
 *
 * `patchExtra` é mesclado no mesmo UPDATE (ex.: `history`) — é aplicado mesmo
 * quando o status não muda, pra não perder o registro de história do evento.
 * Retorna `true` só quando o status realmente mudou (caller decide se dispara
 * webhook de integração com base nisso).
 */
export async function moverLeadStatus(params: {
  db: SupabaseClient;
  leadId: string;
  userId: string;
  statusAtual: string | null;
  novoStatus: string;
  permitidoDe: readonly string[];
  origem: LeadAuditOrigem;
  detalhes?: Record<string, unknown>;
  patchExtra?: Record<string, unknown>;
}): Promise<boolean> {
  const { db, leadId, userId, statusAtual, novoStatus, permitidoDe, origem, detalhes, patchExtra } = params;
  const podeMover = statusAtual !== null && permitidoDe.includes(statusAtual) && statusAtual !== novoStatus;

  if (!podeMover) {
    if (patchExtra) {
      await db.from("leads").update(patchExtra as never).eq("id", leadId).eq("user_id", userId);
    }
    return false;
  }

  await db
    .from("leads")
    .update({ ...(patchExtra ?? {}), status: novoStatus } as never)
    .eq("id", leadId)
    .eq("user_id", userId);

  await logLeadStatusChange({ leadId, userId, statusAnterior: statusAtual, statusNovo: novoStatus, origem, detalhes });
  return true;
}
