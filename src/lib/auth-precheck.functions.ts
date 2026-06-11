import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Verifica rate limit ANTES da tentativa de login (5 tentativas / 15 min por IP).
 * Chamar do client antes de `supabase.auth.signInWithPassword`.
 * Retorna { ok: true } ou { ok: false, error: string }.
 */
export const precheckLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { honeypot?: string }) => input)
  .handler(async ({ data }) => {
    // Honeypot: se preenchido, é bot. Retorna sucesso silencioso (não revela detecção).
    if (data.honeypot && data.honeypot.trim() !== "") {
      // Pequeno atraso para parecer real
      await new Promise((r) => setTimeout(r, 800));
      return { ok: false as const, error: "Credenciais inválidas." };
    }

    const request = getRequest();
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ok = await checkRateLimit(`login:${ip}`, 5, 15 * 60);
    if (!ok) {
      return {
        ok: false as const,
        error:
          "Muitas tentativas de login. Tente novamente em 15 minutos.",
      };
    }
    return { ok: true as const };
  });
