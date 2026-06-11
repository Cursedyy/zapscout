import { logSecurityEvent, extractReqMeta } from "@/lib/security-log.server";

/** Validação timing-safe do header `x-cron-secret` para endpoints públicos de cron. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Retorna `null` se autorizado, ou uma Response 401 para retornar do handler.
 */
export async function requireCronSecret(
  request: Request,
  endpoint: string,
): Promise<Response | null> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron-auth] CRON_SECRET não configurado");
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!provided || !timingSafeEqual(provided, expected)) {
    const meta = extractReqMeta(request);
    await logSecurityEvent({
      event_type: "cron_unauthorized",
      ip: meta.ip,
      user_agent: meta.user_agent,
      identifier: endpoint,
      reason: provided ? "invalid_secret" : "missing_secret",
    });
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
