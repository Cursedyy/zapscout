import { supabase } from "@/integrations/supabase/client";
import { comPrazoConexao } from "./prazo-conexao";

/**
 * Aguarda a sessão do Supabase estar legível por getSession().
 * Logo após signInWithPassword / setSession, há uma janela curta em que
 * o storage adapter ainda não terminou de gravar — chamar getSession()
 * nesse instante pode retornar null e disparar redirect indevido.
 */
export async function waitForSession(timeoutMs = 2500): Promise<boolean> {
  const start = Date.now();
  // Tentativas com backoff curto
  while (Date.now() - start < timeoutMs) {
    const restante = timeoutMs - (Date.now() - start);
    if (restante <= 0) return false;
    let resposta;
    try {
      resposta = await comPrazoConexao(() => supabase.auth.getSession(), restante);
    } catch {
      return false;
    }
    const { data, error } = resposta;
    if (error) return false;
    if (data.session) return true;
    await new Promise((r) =>
      setTimeout(r, Math.min(80, Math.max(0, timeoutMs - (Date.now() - start)))),
    );
  }
  return false;
}
