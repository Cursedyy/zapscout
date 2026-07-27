/**
 * Pool de instâncias UazAPI por usuário (`uazapi_instancias`).
 *
 * Quando a instância principal é restringida/bloqueada pelo provedor, os crons
 * marcam ela como `restrito` e tentam reservar atomicamente a próxima
 * instância `disponivel` do mesmo usuário — o UPDATE ... WHERE status_disparo
 * = 'disponivel' ... RETURNING garante que dois ticks concorrentes não peguem
 * a mesma reserva.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InstanciaPool = {
  id: string;
  token: string;
  numero: string | null;
  nome: string | null;
};

/** Marca a instância dona do token como restrita (sai do pool de disparo). */
export async function marcarInstanciaRestrita(params: {
  userId: string;
  token: string;
}): Promise<void> {
  const { userId, token } = params;
  if (!token) return;

  const { error } = await supabaseAdmin
    .from("uazapi_instancias")
    .update({ status_disparo: "restrito", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("token", token);

  if (error) console.error("[pool] falha ao marcar instância restrita:", error.message);
}

/**
 * Reserva atomicamente a próxima instância disponível e conectada do usuário.
 * Retorna null quando não há reserva livre.
 */
export async function reservarProximaInstanciaDisponivel(
  userId: string,
): Promise<InstanciaPool | null> {
  const { data: candidatas, error } = await supabaseAdmin
    .from("uazapi_instancias")
    .select("id,token,numero,nome")
    .eq("user_id", userId)
    .eq("status_disparo", "disponivel")
    .not("token", "is", null)
    .order("conectado_em", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[pool] falha ao listar instâncias disponíveis:", error.message);
    return null;
  }

  for (const c of candidatas ?? []) {
    if (!c.token) continue;
    // Claim atômico: só ganha quem conseguir mudar o status_disparo.
    const { data: claimed, error: errClaim } = await supabaseAdmin
      .from("uazapi_instancias")
      .update({ status_disparo: "em_uso", updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status_disparo", "disponivel")
      .select("id,token,numero,nome")
      .maybeSingle();

    if (errClaim) {
      console.error("[pool] falha no claim da instância:", errClaim.message);
      continue;
    }
    if (claimed?.token) {
      return {
        id: claimed.id,
        token: claimed.token,
        numero: claimed.numero,
        nome: claimed.nome,
      };
    }
  }

  return null;
}
