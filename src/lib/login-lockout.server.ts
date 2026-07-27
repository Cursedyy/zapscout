import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Escopos de bloqueio progressivo (namespaces independentes na mesma tabela). */
export type LockoutScope = "login" | "pwreset";

/** Hash SHA-256 do identificador normalizado — nunca gravamos o email em claro. */
export function hashEmail(email: string, scope: LockoutScope = "login"): string {
  return createHash("sha256")
    .update(`${scope}:${email.trim().toLowerCase()}`)
    .digest("hex");
}

/** Retorna `Date` até quando está bloqueado, ou `null` se liberado. */
export async function getLockedUntil(
  email: string,
  scope: LockoutScope = "login",
): Promise<Date | null> {
  const { data, error } = await supabaseAdmin.rpc("check_login_lockout", {
    _email_hash: hashEmail(email, scope),
  });
  if (error) {
    console.warn("[lockout] erro check, liberando:", error.message);
    return null;
  }
  if (!data) return null;
  return new Date(data as string);
}

/** Registra falha/tentativa; devolve nova data de bloqueio (ou null se ainda não atingiu limiar). */
export async function registerFailure(
  email: string,
  scope: LockoutScope = "login",
): Promise<Date | null> {
  const { data, error } = await supabaseAdmin.rpc("register_login_failure", {
    _email_hash: hashEmail(email, scope),
  });
  if (error) {
    console.warn("[lockout] erro register:", error.message);
    return null;
  }
  return data ? new Date(data as string) : null;
}

/** Limpa contador (login bem-sucedido, ou senha efetivamente redefinida). */
export async function clearLockout(
  email: string,
  scope: LockoutScope = "login",
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("clear_login_lockout", {
    _email_hash: hashEmail(email, scope),
  });
  if (error) console.warn("[lockout] erro clear:", error.message);
}

/**
 * Quantidade de falhas/tentativas recentes (últimas 24 h) registradas para o
 * identificador. Usado para decidir se o CAPTCHA adaptativo é exigido.
 */
export async function getFailedCount(
  identifier: string,
  scope: LockoutScope = "login",
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("login_lockouts")
    .select("failed_count, last_failed_at")
    .eq("email_hash", hashEmail(identifier, scope))
    .maybeSingle();
  if (error || !data) return 0;
  const last = data.last_failed_at ? new Date(data.last_failed_at).getTime() : 0;
  if (Date.now() - last > 24 * 60 * 60 * 1000) return 0;
  return data.failed_count ?? 0;
}


function formatEspera(until: Date): string {
  const secs = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.ceil(secs / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.ceil(mins / 60);
  return hrs < 24 ? `${hrs} h` : "24 h";
}

/** Formata mensagem para o usuário (login). */
export function lockoutMessage(until: Date): string {
  const secs = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  if (secs >= 24 * 3600) {
    return `Conta bloqueada por excesso de tentativas. Tente novamente amanhã ou redefina sua senha.`;
  }
  return `Conta temporariamente bloqueada. Tente novamente em ${formatEspera(until)}.`;
}

/** Mensagem genérica para recuperação de senha (não revela se o email existe). */
export function resetLockoutMessage(until: Date): string {
  return `Muitos pedidos de recuperação. Tente novamente em ${formatEspera(until)}.`;
}

