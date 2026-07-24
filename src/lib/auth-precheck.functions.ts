import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

function getReqMeta() {
  const request = getRequest();
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

function hashEmail(email: string): string {
  // hash simples e determinístico só para agrupar rate-limit por email
  // sem armazenar o email em plaintext na chave.
  let h = 0;
  const s = email.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * Verifica rate limit ANTES da tentativa de login (5 tentativas / 15 min por IP).
 * Chamar do client antes de `supabase.auth.signInWithPassword`.
 * Retorna { ok: true } ou { ok: false, error: string }.
 */
export const precheckLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { honeypot?: string; email?: string }) => input)
  .handler(async ({ data }) => {
    const { ip, userAgent } = getReqMeta();
    const { logSecurityEvent } = await import("@/lib/security-log.server");

    if (data.honeypot && data.honeypot.trim() !== "") {
      void logSecurityEvent({
        event_type: "honeypot_triggered",
        ip,
        user_agent: userAgent,
        identifier: data.email ?? null,
        reason: "login_honeypot",
      });
      await new Promise((r) => setTimeout(r, 800));
      return { ok: false as const, error: "Credenciais inválidas." };
    }

    // Bloqueio progressivo por email (independente de IP).
    if (data.email) {
      const { getLockedUntil, lockoutMessage } = await import(
        "@/lib/login-lockout.server"
      );
      const until = await getLockedUntil(data.email);
      if (until) {
        void logSecurityEvent({
          event_type: "login_locked_out",
          ip,
          user_agent: userAgent,
          identifier: data.email,
          reason: `locked_until:${until.toISOString()}`,
        });
        return { ok: false as const, error: lockoutMessage(until) };
      }
    }

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ctx = {
      ip,
      user_agent: userAgent,
      identifier: data.email ?? null,
    };
    // Por IP: 5 tentativas / 15 min
    const ipOk = await checkRateLimit(`login:ip:${ip}`, 5, 15 * 60, {
      eventType: "login_rate_limited",
      ...ctx,
    });
    // Por email: 8 tentativas / 15 min (evita account-lock via IPs rotativos)
    const emailOk = data.email
      ? await checkRateLimit(`login:email:${hashEmail(data.email)}`, 8, 15 * 60, {
          eventType: "login_rate_limited",
          ...ctx,
        })
      : true;

    if (!ipOk || !emailOk) {
      return {
        ok: false as const,
        error: "Muitas tentativas de login. Tente novamente em 15 minutos.",
      };
    }
    return { ok: true as const };
  });


/** Registra uma tentativa de login falha (chamado APÓS o signInWithPassword retornar erro). */
export const logLoginFailure = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; reason: string }) => input)
  .handler(async ({ data }) => {
    const { ip, userAgent } = getReqMeta();
    const { logSecurityEvent } = await import("@/lib/security-log.server");
    const { registerFailure } = await import("@/lib/login-lockout.server");
    const lockedUntil = await registerFailure(data.email);
    await logSecurityEvent({
      event_type: "login_failed",
      ip,
      user_agent: userAgent,
      identifier: data.email,
      reason: data.reason.slice(0, 200),
      details: lockedUntil ? { locked_until: lockedUntil.toISOString() } : null,
    });
    return {
      ok: true,
      lockedUntil: lockedUntil?.toISOString() ?? null,
    };
  });

/** Limpa contador de falhas após login bem-sucedido. */
export const clearLoginLockout = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const { clearLockout } = await import("@/lib/login-lockout.server");
    await clearLockout(data.email);
    return { ok: true };
  });



/**
 * Rate limit ANTES de `supabase.auth.signUp`.
 * - 3 signups / hora por IP  (evita criação em massa de contas)
 * - 2 signups / dia por email (evita spam de email de confirmação p/ mesma conta)
 */
export const precheckSignup = createServerFn({ method: "POST" })
  .inputValidator((input: { honeypot?: string; email?: string }) => input)
  .handler(async ({ data }) => {
    const { ip, userAgent } = getReqMeta();
    const { logSecurityEvent } = await import("@/lib/security-log.server");

    if (data.honeypot && data.honeypot.trim() !== "") {
      void logSecurityEvent({
        event_type: "honeypot_triggered",
        ip,
        user_agent: userAgent,
        identifier: data.email ?? null,
        reason: "signup_honeypot",
      });
      await new Promise((r) => setTimeout(r, 1000));
      return { ok: false as const, error: "Não foi possível criar a conta. Tente novamente." };
    }

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ctx = { ip, user_agent: userAgent, identifier: data.email ?? null };

    const ipOk = await checkRateLimit(`signup:ip:${ip}`, 3, 60 * 60, {
      eventType: "rate_limit_hit",
      ...ctx,
    });
    const emailOk = data.email
      ? await checkRateLimit(`signup:email:${hashEmail(data.email)}`, 2, 24 * 60 * 60, {
          eventType: "rate_limit_hit",
          ...ctx,
        })
      : true;

    if (!ipOk || !emailOk) {
      return {
        ok: false as const,
        error: "Muitas tentativas de cadastro. Tente novamente mais tarde.",
      };
    }
    return { ok: true as const };
  });

/**
 * Rate limit ANTES de `supabase.auth.resetPasswordForEmail`.
 * - 3 pedidos / hora por IP
 * - 3 pedidos / hora por email (protege caixa do usuário contra spam)
 */
export const precheckPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: { email?: string }) => input)
  .handler(async ({ data }) => {
    const { ip, userAgent } = getReqMeta();
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ctx = { ip, user_agent: userAgent, identifier: data.email ?? null };

    const ipOk = await checkRateLimit(`pwreset:ip:${ip}`, 3, 60 * 60, {
      eventType: "rate_limit_hit",
      ...ctx,
    });
    const emailOk = data.email
      ? await checkRateLimit(`pwreset:email:${hashEmail(data.email)}`, 3, 60 * 60, {
          eventType: "rate_limit_hit",
          ...ctx,
        })
      : true;

    if (!ipOk || !emailOk) {
      return {
        ok: false as const,
        error: "Muitos pedidos de recuperação. Tente novamente em 1 hora.",
      };
    }
    return { ok: true as const };
  });
