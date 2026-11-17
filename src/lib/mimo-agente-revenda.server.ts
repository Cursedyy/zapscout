import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RevendaDB } from "./mimo-revenda-db";
import { telefoneRevendaAgente, validarFichaRevendaAgente } from "./mimo-agente-revenda";

/** Optional enrichment: a lookup failure must not block an already-promised handoff. */
export async function lerFichaRevendaAgente(empresa: string, telefone: string, agora = new Date()) {
  const numero = telefoneRevendaAgente(telefone);
  if (!numero) return null;
  try {
    const db = supabaseAdmin as unknown as SupabaseClient<RevendaDB>;
    const r = await db.from("mimo_revenda_inscricoes")
      .select("id,empresa_id,lead_id,telefone,respostas,minimo_centavos,created_at")
      .eq("empresa_id", empresa).eq("telefone", numero)
      .gte("created_at", new Date(agora.getTime() - 30 * 86400000).toISOString())
      .lte("created_at", agora.toISOString())
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(1).abortSignal(AbortSignal.timeout(3000)).maybeSingle();
    if (r.error) return null;
    return validarFichaRevendaAgente(r.data, empresa, numero, agora);
  } catch { return null; }
}
