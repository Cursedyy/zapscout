import { z } from "zod";

// Adapted from the pre-existing Codex draft: same bounded, review-only snippet flow.
export const codexRequestSchema = z
  .object({
    mode: z.enum(["generate", "edit"]),
    prompt: z.string().trim().min(10).max(4000),
    code: z.string().max(20000).default(""),
    language: z.literal("typescript").default("typescript"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "edit" && !v.code.trim())
      ctx.addIssue({ code: "custom", message: "Cole o código que deseja editar." });
    if (v.mode === "generate" && v.code)
      ctx.addIssue({ code: "custom", message: "A geração não recebe código oculto." });
  });
export type CodexRequest = z.infer<typeof codexRequestSchema>;
export const CODEX_MAX_OUTPUT = 32000;

export function buildCodexTask({ mode, prompt, code, language }: CodexRequest) {
  const objetivo = mode === "edit" ? "Edite o código fornecido" : "Gere um novo trecho de código";
  const fonte = mode === "edit" ? `\n\nCÓDIGO ATUAL (${language}):\n${code}` : "";
  return `${objetivo} em ${language} para esta solicitação:\n${prompt}${fonte}\n\nRetorne somente texto revisável, preferencialmente em um bloco de código Markdown. Não inclua segredos, chaves, tokens ou dados pessoais. Não afirme ter executado ou aplicado o código.`;
}
export function codexErrorMessage(status: number): string {
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  if (status === 403) return "Acesso exclusivo à administração e gestão MiMo.";
  if (status === 429) return "Limite de solicitações atingido. Aguarde antes de tentar novamente.";
  if (status === 503)
    return "A ferramenta administrativa não está disponível. Confira a configuração com a administração.";
  if (status === 504) return "A geração excedeu o tempo disponível. Tente novamente mais tarde.";
  if (status === 400 || status === 413 || status === 415)
    return "Confira a solicitação e os limites de entrada.";
  return "Não foi possível concluir a geração. O resultado pode estar incompleto.";
}

export type CodexEvent =
  { type: "delta"; text: string } | { type: "complete" } | { type: "error"; message: string };

/** Bounded SSE decoder for both sides. Handles UTF-8 fragments, CR/LF/CRLF,
 * comments and multiline data; a truncated frame is never a successful EOF. */
export async function* lerSseCodex(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const reader = body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    event = "message",
    data: string[] = [],
    tamanho = 0,
    total = 0;
  const abortar = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abortar, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
      const r = await reader.read();
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
      if (r.value) total += r.value.byteLength;
      if (total > 1024 * 1024) throw Error("Transmissão acima do limite.");
      buffer += r.done ? decoder.decode() : decoder.decode(r.value, { stream: true });
      while (true) {
        const pos = buffer.search(/[\r\n]/);
        if (pos < 0 || (!r.done && buffer[pos] === "\r" && pos === buffer.length - 1)) break;
        const linha = buffer.slice(0, pos);
        buffer = buffer.slice(pos + (buffer[pos] === "\r" && buffer[pos + 1] === "\n" ? 2 : 1));
        tamanho += linha.length;
        if (tamanho > 256 * 1024) throw Error("Evento acima do limite.");
        if (!linha) {
          if (data.length) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
          tamanho = 0;
        } else if (!linha.startsWith(":")) {
          const colon = linha.indexOf(":"),
            campo = colon < 0 ? linha : linha.slice(0, colon);
          let valor = colon < 0 ? "" : linha.slice(colon + 1);
          if (valor.startsWith(" ")) valor = valor.slice(1);
          if (campo === "event") event = valor;
          if (campo === "data") data.push(valor);
        }
      }
      if (buffer.length + tamanho > 256 * 1024) throw Error("Evento acima do limite.");
      if (r.done) {
        if (buffer || data.length) throw Error("Transmissão incompleta.");
        return;
      }
    }
  } finally {
    signal?.removeEventListener("abort", abortar);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const eventoClienteSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string().max(CODEX_MAX_OUTPUT) }).strict(),
  z.object({ type: z.literal("complete") }).strict(),
  z.object({ type: z.literal("error"), message: z.string().max(300) }).strict(),
]);
export async function consumirCodex(
  body: ReadableStream<Uint8Array>,
  aoTexto: (texto: string) => void,
  signal: AbortSignal,
) {
  let tamanho = 0;
  for await (const frame of lerSseCodex(body, signal)) {
    const evento = eventoClienteSchema.parse(JSON.parse(frame.data));
    if (frame.event !== evento.type) throw Error("Evento inválido.");
    if (evento.type === "error") throw Error(codexErrorMessage(502));
    if (evento.type === "complete") {
      if (!tamanho) throw Error("Resposta sem texto.");
      return;
    }
    tamanho += evento.text.length;
    if (tamanho > CODEX_MAX_OUTPUT) throw Error("Resultado acima do limite.");
    aoTexto(evento.text);
  }
  throw Error("Transmissão incompleta.");
}
