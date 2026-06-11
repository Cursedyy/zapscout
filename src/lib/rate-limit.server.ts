import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logSecurityEvent } from "@/lib/security-log.server";

/**
 * Rate limit baseado em janela deslizante simples.
 * Retorna true se a requisição pode prosseguir, false se atingiu o limite.
 * Falha aberta (permite) em caso de erro do DB para não travar o app.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSecs: number,
  logCtx?: {
    eventType?: "rate_limit_hit" | "login_rate_limited";
    ip?: string | null;
    user_agent?: string | null;
    identifier?: string | null;
  },
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: key,
      _max: max,
      _window_secs: windowSecs,
    });
    if (error) {
      console.warn("[rate-limit] erro DB, permitindo:", error.message);
      return true;
    }
    const ok = data === true;
    if (!ok && logCtx) {
      void logSecurityEvent({
        event_type: logCtx.eventType ?? "rate_limit_hit",
        ip: logCtx.ip,
        user_agent: logCtx.user_agent,
        identifier: logCtx.identifier ?? key,
        reason: `limit ${max}/${windowSecs}s`,
        details: { key, max, window_secs: windowSecs },
      });
    }
    return ok;
  } catch (e) {
    console.warn("[rate-limit] exception, permitindo:", e);
    return true;
  }
}

/** Extrai IP do cliente respeitando headers comuns de proxy/CDN. */
export function getClientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export class RateLimitError extends Error {
  status = 429;
  constructor(public retryAfterSecs: number) {
    super("Muitas requisições. Tente novamente em alguns instantes.");
  }
}

export function rateLimitResponse(retryAfterSecs = 60): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", retry_after: retryAfterSecs }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSecs),
      },
    },
  );
}
