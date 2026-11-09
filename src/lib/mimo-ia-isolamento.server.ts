import type { SupabaseClient } from "@supabase/supabase-js";
import { hashTokenMimo } from "./mimo-whatsapp";
/** Also guards personal messages already queued before a commercial binding existed. */
export async function instanciaComercialMimo(
  db: SupabaseClient,
  owner: string,
  token: string | null,
) {
  if (!token) return false;
  const r = await db
    .from("mimo_whatsapp_vinculos")
    .select("id")
    .eq("owner_id", owner)
    .eq("token_sha256", await hashTokenMimo(token))
    .eq("ativo", true)
    .maybeSingle();
  if (r.error) throw Error("mimo_isolamento_indisponivel");
  return !!r.data;
}
