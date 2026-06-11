import { isSuspiciousBot } from "@/lib/sanitize";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit.server";
import { requireCronSecret } from "@/lib/cron-auth.server";
import { logSecurityEvent, extractReqMeta } from "@/lib/security-log.server";

/**
 * Aplica em sequência:
 *  1) bloqueia user-agents suspeitos (403) e loga
 *  2) rate limit 10/min por IP (429) e loga
 *  3) exige `x-cron-secret` válido (401) e loga
 *
 * Retorna uma Response para abortar, ou `null` para continuar.
 */
export async function gateCronHook(
  request: Request,
  endpoint: string,
): Promise<Response | null> {
  const meta = extractReqMeta(request);

  if (isSuspiciousBot(meta.user_agent)) {
    void logSecurityEvent({
      event_type: "bot_blocked",
      ip: meta.ip,
      user_agent: meta.user_agent,
      identifier: endpoint,
      reason: "suspicious_user_agent",
    });
    return new Response("Forbidden", { status: 403 });
  }

  const ip = getClientIp(request);
  const ok = await checkRateLimit(`pubhook:${endpoint}:${ip}`, 10, 60, {
    eventType: "rate_limit_hit",
    ip: meta.ip,
    user_agent: meta.user_agent,
    identifier: `pubhook:${endpoint}`,
  });
  if (!ok) return rateLimitResponse(60);

  return requireCronSecret(request, endpoint);
}
