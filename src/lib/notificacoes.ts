export const CHAVE_NOTIFICACOES_NAO_LIDAS = ["notificacoes", "nao-lidas"] as const;

export const EVENTO_NOTIFICACOES_ATUALIZADAS = "zapscout:notificacoes-atualizadas";

export function notificarAtualizacaoDeNotificacoes() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTO_NOTIFICACOES_ATUALIZADAS));
  }
}
