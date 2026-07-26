/**
 * Helpers para impedir enumeração de emails nas telas de auth.
 * - Mensagens genéricas e idênticas para qualquer falha.
 * - Atraso aleatório para que o tempo de resposta não revele se a conta existe.
 */

export const GENERIC_LOGIN_ERROR = {
  title: "Não foi possível entrar",
  message:
    "Email ou senha incorretos, ou a conta ainda não foi confirmada. Verifique os dados e sua caixa de entrada.",
};

export const GENERIC_RESET_MESSAGE =
  "Se existir uma conta com esse email, enviamos um link de recuperação. Verifique sua caixa de entrada e o spam.";

export const GENERIC_RESEND_MESSAGE =
  "Se existir uma conta pendente de confirmação com esse email, reenviamos o link.";

/** Aguarda um tempo aleatório (padrão 350–1200 ms) para uniformizar a latência percebida. */
export function randomDelay(minMs = 350, maxMs = 1200): Promise<void> {
  const ms = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}
