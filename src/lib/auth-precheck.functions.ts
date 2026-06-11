import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Verifica rate limit ANTES da tentativa de login (5 tentativas / 15 min por IP).
 * Chamar do client antes de `supabase.auth.signInWithPassword`.
 * Retorna { ok: true } ou { ok: false, error: string }.
 */
export const precheckLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { honeypot?: string; email?: string }) => input)
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const userAgent = request.headers.get("user-agent");

    const { logSecurityEvent } = await import("@/lib/security-log.server");

    // Honeypot: se preenchido, é bot. Retorna falha silenciosa (não revela detecção).
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

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ok = await checkRateLimit(`login:${ip}`, 5, 15 * 60, {
      eventType: "login_rate_limited",
      ip,
      user_agent: userAgent,
      identifier: data.email ?? null,
    });
    if (!ok) {
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
    const request = getRequest();
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const { logSecurityEvent } = await import("@/lib/security-log.server");
    await logSecurityEvent({
      event_type: "login_failed",
      ip,
      user_agent: request.headers.get("user-agent"),
      identifier: data.email,
      reason: data.reason.slice(0, 200),
    });
    return { ok: true };
  });
