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

  // 1) Cron secret primeiro — se válido, o caller é legítimo (n8n, pg_cron, etc.)
  //    e pulamos bot-UA/rate-limit. Isso evita 403 falso-positivo pra clientes
  //    HTTP com user-agent curto ou ausente (n8n, workflows internos).
  const cronFail = await requireCronSecret(request, endpoint);
  if (cronFail === null) return null;

  // 2) Sem secret válido: aplica bot-UA + rate limit e devolve o 401 do secret.
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

  return cronFail;
}
