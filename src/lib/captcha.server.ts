import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * CAPTCHA adaptativo self-hosted (sem provedor externo).
 * Desafio aritmético simples assinado com HMAC — o servidor não guarda estado:
 * a resposta correta só pode ser validada recomputando a assinatura.
 */

export type CaptchaChallenge = {
  /** Pergunta exibida ao usuário, ex.: "7 + 4" */
  question: string;
  /** Token opaco assinado que acompanha a resposta */
  token: string;
};

const TTL_SECS = 5 * 60;

function secret(): string {
  const s = process.env.CAPTCHA_SIGNING_SECRET;
  if (!s) throw new Error("CAPTCHA_SIGNING_SECRET ausente");
  return s;
}

function sign(payload: string, answer: string): string {
  return createHmac("sha256", secret())
    .update(`${payload}|${answer.trim().toLowerCase()}`)
    .digest("hex");
}

/** Gera um novo desafio aritmético. */
export function createChallenge(): CaptchaChallenge {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  const somar = Math.random() < 0.7;
  const [x, y] = somar ? [a, b] : [Math.max(a, b), Math.min(a, b)];
  const question = somar ? `${x} + ${y}` : `${x} - ${y}`;
  const answer = String(somar ? x + y : x - y);

  const exp = Math.floor(Date.now() / 1000) + TTL_SECS;
  const nonce = randomBytes(9).toString("hex");
  const payload = `${exp}.${nonce}`;
  return { question, token: `${payload}.${sign(payload, answer)}` };
}

/** Valida token + resposta. Retorna true apenas se a assinatura bater e não estiver expirado. */
export async function verifyChallenge(
  token: string | undefined,
  answer: string | undefined,
): Promise<boolean> {
  if (!token || !answer) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  const expected = sign(`${expStr}.${nonce}`, answer);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  // Uso único: o mesmo nonce não pode ser reaproveitado dentro da validade.
  const { checkRateLimit } = await import("@/lib/rate-limit.server");
  const primeiroUso = await checkRateLimit(`captcha:nonce:${nonce}`, 1, TTL_SECS);
  return primeiroUso;
}
