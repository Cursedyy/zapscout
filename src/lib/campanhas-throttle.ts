/**
 * Regras puras de throttling e seleção de próximo item de campanha.
 * Isoladas para permitir teste automatizado independente do banco/UAZAPI.
 *
 * O cron `process-campaigns` roda a cada 1 minuto e, para cada campanha em
 * andamento, decide se deve disparar o próximo item pendente comparando
 * `now - lastSentAt` com `intervaloMs(limitePorHora)`.
 */

export type CampItemStatusLike = "pendente" | "enviado" | "falha" | "pulado";

export type CampanhaThrottleInput = {
  /** Timestamp (ms) do último envio persistido. 0 / null quando ainda não enviou. */
  lastSentAt: number | null;
  /** Limite de mensagens por hora configurado na campanha. */
  limitePorHora: number;
  /** Momento em que a checagem está sendo feita (ms). */
  now: number;
};

/** Intervalo mínimo entre envios em milissegundos. Mínimo absoluto de 1s. */
export function intervaloMs(limitePorHora: number): number {
  const perHora = Math.max(1, limitePorHora);
  return Math.max(1_000, Math.floor(3_600_000 / perHora));
}

/**
 * Retorna true se a campanha pode disparar agora respeitando o intervalo.
 * Se `lastSentAt` for null/0, sempre pode disparar (primeiro envio).
 */
export function shouldFire({ lastSentAt, limitePorHora, now }: CampanhaThrottleInput): boolean {
  const last = lastSentAt ?? 0;
  if (last <= 0) return true;
  return now - last >= intervaloMs(limitePorHora);
}

/**
 * Retorna o índice do próximo item pendente, ou -1 se não houver.
 * Só considera status "pendente" — itens "enviado", "falha" e "pulado" são ignorados.
 */
export function pickNextPendingIndex<T extends { status: CampItemStatusLike }>(items: readonly T[]): number {
  return items.findIndex((it) => it.status === "pendente");
}

/**
 * Simula o loop do cron para uma única campanha ao longo de N ticks de 1 min.
 * Retorna a lista de timestamps (em ms) em que a campanha efetivamente
 * disparou. Útil para testes de throttling determinístico.
 */
export function simulateCampanhaTicks(params: {
  limitePorHora: number;
  itemsPendentes: number;
  startAt: number;
  tickMs: number;
  ticks: number;
}): number[] {
  const disparos: number[] = [];
  let lastSentAt = 0;
  let restantes = params.itemsPendentes;

  for (let i = 0; i < params.ticks; i++) {
    const now = params.startAt + i * params.tickMs;
    if (restantes <= 0) break;
    if (shouldFire({ lastSentAt, limitePorHora: params.limitePorHora, now })) {
      disparos.push(now);
      lastSentAt = now;
      restantes--;
    }
  }

  return disparos;
}
