import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { hashTokenMimo, numeroConectadoMimo } from "./mimo-whatsapp";
import { uazStatus } from "./uazapi.server";
export async function obterRemetenteAgente(
  empresa: string,
  vinculo: string,
): Promise<string | null> {
  const t = { empresa, vinculo };

  const r = await db
    .from("mimo_whatsapp_vinculos")
    .select("*")
    .eq("empresa_id", t.empresa)
    .eq("id", t.vinculo)
    .eq("ativo", true)
    .maybeSingle();
  const v = r.data;
  if (r.error || !v) return null;
  const [p, i] = await Promise.all([
    db.from("profiles").select("id,uazapi_instance_token").eq("id", v.owner_id).maybeSingle(),
    v.instancia_id
      ? db
          .from("uazapi_instancias")
          .select("id,user_id,token")
          .eq("id", v.instancia_id)
          .eq("user_id", v.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const atual = v.instancia_id ? i.data?.token : p.data?.uazapi_instance_token;
  if (p.error || i.error || !atual || (await hashTokenMimo(atual)) !== v.token_sha256) return null;
  const [ps, is] = await Promise.all([
    db.from("profiles").select("id").eq("uazapi_instance_token", atual),
    db.from("uazapi_instancias").select("user_id").eq("token", atual),
  ]);
  const donos = new Set([
    ...(ps.data ?? []).map((x) => x.id),
    ...(is.data ?? []).map((x) => x.user_id),
  ]);
  if (ps.error || is.error || donos.size !== 1 || !donos.has(v.owner_id)) return null;
  const s = await uazStatus(atual, AbortSignal.timeout(7000));
  if (
    s.status !== "connected" ||
    !numeroConectadoMimo(s.profileNumber) ||
    numeroConectadoMimo(s.profileNumber) !== numeroConectadoMimo(v.numero_comercial)
  )
    return null;
  return atual;
}
