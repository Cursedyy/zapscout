import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SecurityEventType =
  | "login_failed"
  | "login_rate_limited"
  | "login_locked_out"
  | "rate_limit_hit"
  | "webhook_rejected"
  | "cron_unauthorized"
  | "bot_blocked"
  | "honeypot_triggered";

export type SecurityEvent = {
  event_type: SecurityEventType;
  ip?: string | null;
  user_agent?: string | null;
  identifier?: string | null; // email / user_id / order_id
  reason?: string | null;
  details?: Record<string, unknown> | null;
};

/**
 * Grava um evento de segurança. Falha silenciosamente — log não deve quebrar app.
 * Use somente em código server-only (server fns, route handlers).
 */
export async function logSecurityEvent(evt: SecurityEvent): Promise<void> {
  try {
    await supabaseAdmin.from("security_logs").insert({
      event_type: evt.event_type,
      ip: evt.ip ?? null,
      user_agent: evt.user_agent ?? null,
      identifier: evt.identifier ?? null,
      reason: evt.reason ?? null,
      details: (evt.details ?? null) as never,
    });
  } catch (e) {
    console.warn("[security-log] falhou:", e);
  }
}

/** Extrai IP + UA de uma Request — atalho usado pelos call sites. */
export function extractReqMeta(request: Request) {
  const h = request.headers;
  return {
    ip:
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null,
    user_agent: h.get("user-agent"),
  };
}
