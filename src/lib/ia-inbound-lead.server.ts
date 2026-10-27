import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Called only after webhook authentication and instance-owner resolution. */
export async function criarLeadRecebidoIA(db: SupabaseClient, userId: string, numero: string) {
  const input = z.object({ userId: z.string().uuid(), numero: z.string().regex(/^\d{8,15}$/) })
    .parse({ userId, numero });
  const { data: config, error: configError } = await db.from("ia_config")
    .select("ativa").eq("user_id", input.userId).maybeSingle();
  if (configError) throw new Error("Não foi possível verificar a IA de Vendas.");
  if (!config?.ativa) return null;

  const { data: lead, error } = await db.from("leads").insert({
    user_id: input.userId,
    nome_empresa: "Contato WhatsApp",
    nicho: "Contato recebido",
    telefone: input.numero,
    whatsapp: input.numero,
    status: "novo",
    history: [{ ts: Date.now(), text: "Lead criado automaticamente — contato recebido pela IA de Vendas" }] as never,
  }).select("id, sequence_state, status, nome_empresa, telefone, whatsapp, history").single();
  if (error) throw new Error("Não foi possível registrar o contato recebido.");
  return lead;
}