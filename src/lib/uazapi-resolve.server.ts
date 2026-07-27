/**
 * Resolve qual usuário/instância é dono de um token UazAPI, e qual token usar
 * para responder por uma conversa — cobre a instância principal
 * (profiles.uazapi_instance_token) e instâncias extras (uazapi_instancias,
 * ex.: prospecção dedicada).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InstanciaResolvida = { userId: string; instanciaId: string | null };

const PING_FRESCO_MS = 10 * 60 * 1000;

/**
 * Diz se a instância principal do usuário está conectada.
 * Usa o cache do profile quando o último ping é recente; caso contrário
 * consulta a UazAPI e atualiza o cache.
 */
export async function estaInstanciaConectada(params: {
  userId: string;
  token: string | null;
  statusCache?: string | null;
  ultimoPing?: string | null;
}): Promise<boolean> {
  const { userId, token, statusCache, ultimoPing } = params;
  if (!token) return false;

  const pingMs = ultimoPing ? new Date(ultimoPing).getTime() : 0;
  if (pingMs && Date.now() - pingMs < PING_FRESCO_MS) {
    return statusCache === "connected";
  }

  try {
    const { uazStatus } = await import("@/lib/uazapi.server");
    const s = await uazStatus(token);
    const conectada = s.status === "connected";
    await supabaseAdmin
      .from("profiles")
      .update({
        uazapi_instance_status: s.status,
        uazapi_ultimo_ping: new Date().toISOString(),
      })
      .eq("id", userId);
    return conectada;
  } catch (e) {
    console.error("[uazapi-resolve] falha ao checar status da instância:", e);
    return statusCache === "connected";
  }
}


export async function resolveInstanciaPorToken(token: string): Promise<InstanciaResolvida | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("uazapi_instance_token", token)
    .maybeSingle();
  if (profile?.id) return { userId: profile.id as string, instanciaId: null };

  const { data: instancia } = await supabaseAdmin
    .from("uazapi_instancias" as never)
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();
  const row = instancia as { id: string; user_id: string } | null;
  if (row?.user_id) return { userId: row.user_id, instanciaId: row.id };

  return null;
}

/** Token pronto pra enviar pela instância certa. Retorna null se desconectada. */
export async function resolveTokenParaConversa(
  userId: string,
  instanciaId: string | null,
): Promise<string | null> {
  if (!instanciaId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("uazapi_instance_token, uazapi_instance_status")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "connected")
      return null;
    return profile.uazapi_instance_token;
  }

  const { data: instancia, error } = await supabaseAdmin
    .from("uazapi_instancias" as never)
    .select("token, status")
    .eq("id", instanciaId)
    .maybeSingle();
  const row = instancia as { token: string | null; status: string } | null;
  console.log(
    "########## [WEBHOOK-TRACE] resolveTokenParaConversa (uazapi_instancias) — instanciaId:",
    instanciaId,
    "error:",
    error,
    "row.token presente:",
    Boolean(row?.token),
    "row.status:",
    row?.status,
  );
  if (!row?.token || row.status !== "connected") return null;
  return row.token;
}
