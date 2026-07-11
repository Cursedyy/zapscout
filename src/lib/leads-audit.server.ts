/**
 * Helper server-only para gravar mudanças automáticas de status de lead
 * na tabela `leads_status_audit`. É best-effort: nunca lança — se o insert
 * falhar, apenas loga (não queremos derrubar o job que fez a mudança).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
