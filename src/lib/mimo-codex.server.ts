import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCodexTask,
  CODEX_MAX_OUTPUT,
  codexErrorMessage,
  codexRequestSchema,
  lerSseCodex,
  type CodexEvent,
} from "./mimo-codex";

export const CODEX_MODEL = "gpt-6.2-sol";
export function configCodex(env = process.env) {
  if (
    !env.OPENAI_API_KEY?.trim() ||
    (env.OPENAI_CODEX_MODEL && env.OPENAI_CODEX_MODEL !== CODEX_MODEL)
  )
    return null;
  return { key: env.OPENAI_API_KEY.trim(), model: CODEX_MODEL };
}
class FalhaCodex extends Error {
  constructor(readonly status: number) {
    super(codexErrorMessage(status));
  }
}
export async function autenticarCodex(request: Request, env = process.env) {
  const authorization = request.headers.get("authorization");
  if (
    !authorization?.startsWith("Bearer ") ||
    !authorization.slice(7).trim() ||
    authorization.length > 8192
  )
    throw new FalhaCodex(401);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new FalhaCodex(503);
  const db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let userId: string;
  try {
    const { data, error } = await db.auth.getClaims(authorization.slice(7));
    if (error || !data?.claims?.sub) throw Error();
    userId = data.claims.sub;
  } catch {
    throw new FalhaCodex(401);
  }
  try {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(db, userId);
    if (!["administrador", "gestor"].includes(acesso.papel)) throw Error();
    return { empresaId: acesso.empresaId, userId };
  } catch {
    throw new FalhaCodex(403);
  }
}
export async function limitarCodex(empresaId: string, userId: string) {
  // Reuse the durable limiter, but fail closed for a billable API (no logs/content).
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) throw Error();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _key: `mimo-codex:${empresaId}:${userId}`,
      _max: 10,
      _window_secs: 3600,
    });
    if (error || typeof data !== "boolean") throw Error();
    if (!data) throw new FalhaCodex(429);
  } catch (e) {
    throw e instanceof FalhaCodex ? e : new FalhaCodex(503);
  }
}
async function lerEntrada(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new FalhaCodex(415);
  const reader = request.body?.getReader();
  if (!reader) throw new FalhaCodex(400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    texto = "";
  let expirado = false;
  const cancelar = () => {
    void reader.cancel().catch(() => {});
  };
  request.signal.addEventListener("abort", cancelar, { once: true });
  const timer = setTimeout(() => {
    expirado = true;
    cancelar();
  }, 10000);
  try {
    while (true) {
      if (request.signal.aborted) throw new FalhaCodex(499);
      const { done, value } = await reader.read();
      if (request.signal.aborted) throw new FalhaCodex(499);
      if (expirado) throw new FalhaCodex(408);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 128 * 1024) throw new FalhaCodex(413);
      texto += decoder.decode(value, { stream: true });
    }
    texto += decoder.decode();
    return codexRequestSchema.parse(JSON.parse(texto));
  } catch (e) {
    throw e instanceof FalhaCodex ? e : new FalhaCodex(400);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", cancelar);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const headersPrivados = {
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
};
function falha(status: number) {
  return Response.json(
    { message: codexErrorMessage(status) },
    {
      status,
      headers: { ...headersPrivados, ...(status === 429 ? { "Retry-After": "3600" } : {}) },
    },
  );
}
const encoder = new TextEncoder();
const frame = (e: CodexEvent) => encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);

export async function* eventosCodex(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<CodexEvent> {
  let tamanho = 0;
  for await (const f of lerSseCodex(body, signal)) {
    const evento = JSON.parse(f.data) as Record<string, unknown>;
    if (!evento || typeof evento !== "object" || typeof evento.type !== "string")
      throw Error("Evento inválido.");
    if (f.event !== "message" && f.event !== evento.type) throw Error("Tipo de evento divergente.");
    if (evento.type === "response.output_text.delta") {
      if (typeof evento.delta !== "string") throw Error("Delta inválido.");
      tamanho += evento.delta.length;
      if (tamanho > CODEX_MAX_OUTPUT) throw Error("Limite de saída.");
      yield { type: "delta", text: evento.delta };
    } else if (evento.type === "response.completed") {
      if (!tamanho || (evento.response as { status?: string } | undefined)?.status !== "completed")
        throw Error("Conclusão inválida.");
      yield { type: "complete" };
      return;
    } else if (
      [
        "error",
        "response.failed",
        "response.incomplete",
        "response.refusal.delta",
        "response.refusal.done",
      ].includes(evento.type)
    ) {
      throw Error("Geração não concluída.");
    }
    // Ignore metadata and output_text.done: replaying its full text would duplicate output.
  }
  throw Error("A resposta terminou sem confirmação.");
}

type DependenciasCodex = {
  autenticar: typeof autenticarCodex;
  limitar: typeof limitarCodex;
  config: typeof configCodex;
  fetcher: typeof fetch;
};
export async function atenderCodex(
  request: Request,
  deps: DependenciasCodex = {
    autenticar: autenticarCodex,
    limitar: limitarCodex,
    config: configCodex,
    fetcher: fetch,
  },
) {
  try {
    if (!["POST", "GET"].includes(request.method)) return falha(405);
    const origem = request.headers.get("origin");
    if (origem && origem !== new URL(request.url).origin) return falha(403);
    const acesso = await deps.autenticar(request);
    const cfg = deps.config();
    if (request.method === "GET")
      return Response.json({ configurado: !!cfg }, { headers: headersPrivados });
    if (!cfg) return falha(503);
    const entrada = await lerEntrada(request);
    await deps.limitar(acesso.empresaId, acesso.userId);
    if (request.signal.aborted) return falha(499);
    const controller = new AbortController();
    let timeout = false,
      encerrado = false;
    const cancelar = () => controller.abort();
    request.signal.addEventListener("abort", cancelar, { once: true });
    if (request.signal.aborted) controller.abort();
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, 90000);
    const limpar = () => {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", cancelar);
    };
    let upstream: Response;
    try {
      upstream = await deps.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: cfg.model,
          input: buildCodexTask(entrada),
          instructions:
            "Assistente administrativo de código. Produza somente texto para revisão humana. Não há ferramentas, sandbox, repositório, leads ou credenciais acessíveis. Não execute ações nem afirme ter testado ou aplicado código. Responda em português.",
          tools: [],
          tool_choice: "none",
          store: false,
          stream: true,
          max_output_tokens: 4096,
          reasoning: { effort: "low" },
        }),
      });
    } catch {
      limpar();
      return falha(request.signal.aborted ? 499 : timeout ? 504 : 502);
    }
    if (
      !upstream.ok ||
      !upstream.body ||
      !upstream.headers.get("content-type")?.includes("text/event-stream")
    ) {
      await upstream.body?.cancel().catch(() => {});
      limpar();
      return falha(upstream.status === 429 ? 429 : 502);
    }
    const eventos = eventosCodex(upstream.body, controller.signal);
    const stream = new ReadableStream<Uint8Array>({
      async pull(saida) {
        try {
          const proximo = await eventos.next();
          if (encerrado) return;
          if (proximo.done) throw Error("Fim inesperado.");
          saida.enqueue(frame(proximo.value));
          if (proximo.value.type === "complete") {
            encerrado = true;
            saida.close();
            await eventos.return(undefined);
            limpar();
          }
        } catch {
          if (!encerrado) {
            encerrado = true;
            saida.enqueue(
              frame({ type: "error", message: codexErrorMessage(timeout ? 504 : 502) }),
            );
            saida.close();
          }
          controller.abort();
          limpar();
        }
      },
      async cancel() {
        encerrado = true;
        controller.abort();
        await eventos.return(undefined);
        limpar();
      },
    });
    return new Response(stream, {
      headers: { ...headersPrivados, "Content-Type": "text/event-stream; charset=utf-8" },
    });
  } catch (e) {
    return falha(e instanceof FalhaCodex ? e.status : 503);
  }
}
