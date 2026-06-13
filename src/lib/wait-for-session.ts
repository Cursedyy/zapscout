import { supabase } from "@/integrations/supabase/client";

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
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}
