import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Hash SHA-256 do email normalizado — nunca gravamos o email em claro. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** Retorna `Date` até quando o login está bloqueado, ou `null` se liberado. */
export async function getLockedUntil(email: string): Promise<Date | null> {
  const { data, error } = await supabaseAdmin.rpc("check_login_lockout", {
    _email_hash: hashEmail(email),
  });
  if (error) {
    console.warn("[lockout] erro check, liberando:", error.message);
    return null;
  }
  if (!data) return null;
  return new Date(data as string);
}

/** Registra falha; devolve nova data de bloqueio (ou null se ainda não atingiu limiar). */
export async function registerFailure(email: string): Promise<Date | null> {
  const { data, error } = await supabaseAdmin.rpc("register_login_failure", {
    _email_hash: hashEmail(email),
  });
  if (error) {
    console.warn("[lockout] erro register:", error.message);
    return null;
  }
  return data ? new Date(data as string) : null;
}

/** Limpa contador após login bem-sucedido. */
export async function clearLockout(email: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("clear_login_lockout", {
    _email_hash: hashEmail(email),
  });
  if (error) console.warn("[lockout] erro clear:", error.message);
}

/** Formata mensagem para o usuário. */
export function lockoutMessage(until: Date): string {
  const secs = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  if (secs < 60) return `Conta temporariamente bloqueada. Tente novamente em ${secs}s.`;
  const mins = Math.ceil(secs / 60);
  if (mins < 60) return `Conta temporariamente bloqueada. Tente novamente em ${mins} min.`;
  const hrs = Math.ceil(mins / 60);
  if (hrs < 24) return `Conta temporariamente bloqueada. Tente novamente em ${hrs} h.`;
  return `Conta bloqueada por excesso de tentativas. Tente novamente amanhã ou redefina sua senha.`;
}
