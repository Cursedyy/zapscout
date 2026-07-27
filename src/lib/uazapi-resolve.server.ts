/**
 * Resolve qual usuário/instância é dono de um token UazAPI, e qual token usar
 * para responder por uma conversa — cobre a instância principal
 * (profiles.uazapi_instance_token) e instâncias extras (uazapi_instancias,
 * ex.: prospecção dedicada).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazStatus } from "./uazapi.server";

export type InstanciaResolvida = { userId: string; instanciaId: string | null };

/** Cache do status "connected" antes de forçar nova consulta ao vivo na UazAPI. */
const TTL_PING_MS = 5 * 60_000;

/**
 * Verifica se a instância principal (profiles.uazapi_instance_token) está de
 * fato conectada. O campo profiles.uazapi_instance_status só é atualizado por
 * ações manuais (conectar/desconectar QR code) ou por downgrade em falha de
 * envio — nunca há upgrade automático. Por isso, se o cache estiver
 * "connected" mas o ping estiver velho, ou se não estiver "connected",
 * consulta a UazAPI ao vivo antes de decidir, e persiste o resultado.
 */
export async function estaInstanciaConectada(params: {
  userId: string;
  token: string | null;
  statusCache: string | null;
  ultimoPing: string | null;
}): Promise<boolean> {
  const { userId, token, statusCache, ultimoPing } = params;
  if (!token) return false;

  const pingRecente =
    ultimoPing != null && Date.now() - new Date(ultimoPing).getTime() < TTL_PING_MS;
  if (statusCache === "connected" && pingRecente) return true;

  try {
    const live = await uazStatus(token);
    await supabaseAdmin
      .from("profiles")
      .update({
        uazapi_instance_status: live.status,
        uazapi_ultimo_ping: new Date().toISOString(),
      })
      .eq("id", userId);
    return live.status === "connected";
  } catch (e) {
    console.warn("[estaInstanciaConectada] falha ao consultar status ao vivo na UazAPI:", e);
    // Erro transitório na UazAPI: não derruba a instância por isso, confia no cache.
    return statusCache === "connected";
  }
}

export async function resolveInstanciaPorToken(token: string): Promise<InstanciaResolvida | null> {
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("uazapi_instance_token", token)
    .maybeSingle();
  // Sem checar `error`, uma falha transitória de rede/timeout na query fica
  // idêntica nos logs a "token realmente não existe" — impossível distinguir
  // blip pontual de token desconhecido de verdade (ver caso Paulo Brum).
  if (profileErr) {
    console.error(
      "[uazapi-resolve] resolveInstanciaPorToken: erro ao consultar profiles (NÃO é 'token desconhecido' — é falha na query):",
      "token:",
      token.slice(0, 8) + "...",
      "erro:",
      profileErr.message,
      profileErr,
    );
  }
  if (profile?.id) return { userId: profile.id as string, instanciaId: null };

  const { data: instancia, error: instanciaErr } = await supabaseAdmin
    .from("uazapi_instancias" as never)
    .select("id, user_id")
    .eq("token", token)
    .maybeSingle();
  if (instanciaErr) {
    console.error(
      "[uazapi-resolve] resolveInstanciaPorToken: erro ao consultar uazapi_instancias (NÃO é 'token desconhecido' — é falha na query):",
      "token:",
      token.slice(0, 8) + "...",
      "erro:",
      instanciaErr.message,
      instanciaErr,
    );
  }
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
