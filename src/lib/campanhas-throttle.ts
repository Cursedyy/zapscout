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
 * Retorna o índice do próximo item pendente pronto para envio, ou -1 se não houver.
 * Só considera status "pendente" — "enviado", "falha" e "pulado" são ignorados.
 * Se o item tiver `nextRetryAt` definido (ISO ou ms) e ainda estiver no futuro,
 * ele é pulado até o backoff acabar.
 */
export function pickNextPendingIndex<
  T extends { status: CampItemStatusLike; nextRetryAt?: string | number | null },
>(items: readonly T[], now: number = Date.now()): number {
  return items.findIndex((it) => {
    if (it.status !== "pendente") return false;
    if (!it.nextRetryAt) return true;
    const t = typeof it.nextRetryAt === "number" ? it.nextRetryAt : Date.parse(it.nextRetryAt);
    return Number.isFinite(t) ? t <= now : true;
  });
}

/**
 * Backoff exponencial para retentativa de envio: 1min, 2min, 4min, 8min, ...
 * limitado a `maxMs` (default 30min).
 * `attempt` é a contagem de tentativas JÁ FEITAS (>=1). Retorna o delay em ms
 * até a próxima tentativa.
 */
export function computeRetryBackoffMs(
  attempt: number,
  { baseMs = 60_000, maxMs = 1_800_000 }: { baseMs?: number; maxMs?: number } = {},
): number {
  const a = Math.max(1, Math.floor(attempt));
  const raw = baseMs * Math.pow(2, a - 1);
  return Math.min(maxMs, raw);
}

/** Limite máximo de tentativas antes de marcar como falha definitiva. */
export const MAX_RETRY_ATTEMPTS = 5;

/**
 * Aplica retry a um item que falhou de forma transitória. Retorna o novo item
 * e se ele deve ser marcado como falha definitiva.
 */
export function applyRetry<T extends { status: CampItemStatusLike; attempts?: number }>(
  item: T,
  now: number,
  lastError: string,
): { item: T & { attempts: number; nextRetryAt?: string; lastError: string }; giveUp: boolean } {
  const attempts = (item.attempts ?? 0) + 1;
  const giveUp = attempts >= MAX_RETRY_ATTEMPTS;
  const backoffMs = giveUp ? 0 : computeRetryBackoffMs(attempts);
  return {
    item: {
      ...item,
      status: giveUp ? ("falha" as CampItemStatusLike) : ("pendente" as CampItemStatusLike),
      attempts,
      nextRetryAt: giveUp ? undefined : new Date(now + backoffMs).toISOString(),
      lastError: lastError.slice(0, 500),
    } as T & { attempts: number; nextRetryAt?: string; lastError: string },
    giveUp,
  };
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
