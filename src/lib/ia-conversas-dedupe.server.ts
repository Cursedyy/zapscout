/**
 * Dedupe de conversas por telefone.
 *
 * Um mesmo número pode aparecer em mais de um lead (importação duplicada,
 * mesmo estabelecimento em nichos diferentes etc.). Antes de disparar, os
 * crons checam aqui se já existe conversa com aquele telefone em OUTRO lead
 * do mesmo usuário — se existir, o lead atual é pulado para não mandar a
 * mesma abordagem duas vezes pro mesmo WhatsApp.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { variacoesTelefoneBR, onlyDigits } from "@/lib/telefone";

export async function existeConversaParaTelefone(params: {
  userId: string;
  telefone: string;
  excludeLeadId?: string | null;
}): Promise<boolean> {
  const { userId, excludeLeadId } = params;
  const digits = onlyDigits(params.telefone ?? "");
  if (!digits) return false;

  const variacoes = Array.from(new Set([digits, ...variacoesTelefoneBR(digits)])).filter(Boolean);
  if (!variacoes.length) return false;

  // 1. Leads do mesmo usuário que tenham qualquer variação do número.
  const { data: leads, error: errLeads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("user_id", userId)
    .in("telefone", variacoes);
  if (errLeads) {
    console.error("[dedupe] falha ao buscar leads por telefone:", errLeads.message);
    return false;
  }

  const ids = (leads ?? []).map((l) => l.id).filter((id) => id !== excludeLeadId);
  if (!ids.length) return false;

  // 2. Algum desses leads já tem conversa registrada?
  const { data: convs, error: errConv } = await supabaseAdmin
    .from("ia_conversas")
    .select("id")
    .eq("user_id", userId)
    .in("lead_id", ids)
    .limit(1);
  if (errConv) {
    console.error("[dedupe] falha ao buscar conversas:", errConv.message);
    return false;
  }

  return (convs ?? []).length > 0;
}
