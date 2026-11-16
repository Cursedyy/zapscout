export class PrazoConexaoError extends Error {
  constructor() {
    super("O servidor demorou para responder. Tente novamente em instantes.");
    this.name = "PrazoConexaoError";
  }
}

/** Bounds reads/fetches and cancels their transport; a late reply cannot advance the caller. */
export function comPrazoConexao<T>(
  operacao: (signal: AbortSignal) => Promise<T>,
  ms = 8000,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PrazoConexaoError());
      controller.abort();
    }, ms);
    Promise.resolve()
      .then(() => operacao(controller.signal))
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

/** Only auth HTTP gets a deadline; order saves, uploads and other RPCs keep their contracts. */
export async function fetchAutenticacaoComPrazo(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!new URL(url).pathname.startsWith("/auth/v1/")) return fetch(input, init);
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return comPrazoConexao(async (signal) => {
    const controller = new AbortController();
    const abortar = () => controller.abort();
    if (signal.aborted || callerSignal?.aborted) controller.abort();
    signal.addEventListener("abort", abortar, { once: true });
    callerSignal?.addEventListener("abort", abortar, { once: true });
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      // Headers alone do not finish auth: keep the deadline until its JSON body arrives.
      await response.clone().arrayBuffer();
      return response;
    } finally {
      signal.removeEventListener("abort", abortar);
      callerSignal?.removeEventListener("abort", abortar);
    }
  }, 20000);
}
