import { checkRateLimit } from "@/lib/rate-limit.server";

/**
 * Rate limit para chamadas de IA por usuário autenticado.
 * Protege contra abuso do gateway Lovable AI (custo/quota) e envio de spam
 * via WhatsApp usando a IA como amplificador.
 *
 * Retorna null se ok, ou uma Error para o handler propagar.
 */
export async function checkIaRate(
  userId: string,
  scope: "gen" | "chat" | "manual",
  ip?: string | null,
): Promise<Error | null> {
  // Limites por escopo:
  //   gen    — geração de config/campanhas (pesado, criativo): 20 / hora
  //   chat   — resposta a mensagem de lead: 120 / hora (fluxo natural de conversa)
  //   manual — envio manual pela UI ou início de conversa: 60 / hora
  const limites: Record<typeof scope, { max: number; windowSecs: number }> = {
    gen: { max: 20, windowSecs: 60 * 60 },
    chat: { max: 120, windowSecs: 60 * 60 },
    manual: { max: 60, windowSecs: 60 * 60 },
  };
  const { max, windowSecs } = limites[scope];
  const ok = await checkRateLimit(`ia:${scope}:${userId}`, max, windowSecs, {
    eventType: "rate_limit_hit",
    ip: ip ?? null,
    identifier: `ia:${scope}:${userId}`,
  });
  if (ok) return null;
  return new Error(
    "Muitas requisições de IA em pouco tempo. Aguarde alguns minutos e tente novamente.",
  );
}
