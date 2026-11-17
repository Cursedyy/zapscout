import { ErroIAAgente } from "./mimo-agente-diagnostico";

export type UsoIA = "conversa" | "classificacao" | "score" | "campanhas" | "agente";
export type MensagemProvedorIA = {
  role: "system" | "user" | "assistant";
  content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
};

/** Configuration is server-only and never accepts a URL or key from a request. */
export function configurarProvedorIA(
  uso: UsoIA,
  modeloLegado = "google/gemini-2.5-flash",
  env: Record<string, string | undefined> = process.env,
) {
  const provider = env.IA_PROVIDER?.trim() || "lovable";
  if (provider === "lovable") {
    const apiKey = env.LOVABLE_API_KEY?.trim();
    if (!apiKey) throw new ErroIAAgente("ia_sem_credencial");
    return { provider, apiKey, baseURL: "https://ai.gateway.lovable.dev/v1", model: modeloLegado };
  }
  // Selecting a direct provider must never silently fall back to Lovable.
  if (provider !== "gemini" && provider !== "anthropic" && provider !== "openai-compatible")
    throw new ErroIAAgente("ia_indisponivel");
  const apiKey = (provider === "gemini" ? env.GEMINI_API_KEY : provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.IA_API_KEY)?.trim();
  if (!apiKey) throw new ErroIAAgente("ia_sem_credencial");
  const model = (env[`IA_MODEL_${uso.toUpperCase()}`] || env.IA_MODEL)?.trim();
  if (!model || /[\r\n]/.test(model)) throw new ErroIAAgente("ia_modelo_indisponivel");
  const base = provider === "gemini"
    ? "https://generativelanguage.googleapis.com/v1beta/openai"
    : provider === "anthropic" ? "https://api.anthropic.com/v1" : env.IA_BASE_URL;
  let url: URL;
  try { url = new URL(base || ""); } catch { throw new ErroIAAgente("ia_indisponivel"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      /(^|\.)lovable\.dev$/i.test(url.hostname)) throw new ErroIAAgente("ia_indisponivel");
  return { provider, apiKey, baseURL: url.href.replace(/\/+$/, ""), model };
}

/** Single HTTP attempt with one deadline covering both headers and the response body. */
export async function chamarChatIA(
  messages: MensagemProvedorIA[],
  uso: UsoIA = "conversa",
  modeloLegado?: string,
): Promise<string> {
  return (await gerarChatIA(messages, uso, modeloLegado)).texto;
}

/** Remove constraints unsupported by Claude; the original Zod schema still validates the result. */
export function schemaParaClaude(schema: object): object {
  const limites = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "pattern", "format", "default", "$schema"]);
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (limites.has(key)) continue;
      // Property names may equal schema keywords; don't treat them as keywords.
      out[key] = key === "properties" && item && typeof item === "object"
        ? Object.fromEntries(Object.entries(item).map(([name, field]) => [name, walk(field)]))
        : walk(item);
    }
    if (out.type === "object") out.additionalProperties = false;
    return out;
  };
  return walk(schema) as object;
}

export async function gerarChatIA(
  messages: MensagemProvedorIA[],
  uso: UsoIA = "conversa",
  modeloLegado?: string,
  schema?: object,
): Promise<{ texto: string; tokensEntrada?: number; tokensSaida?: number }> {
  const config = configurarProvedorIA(uso, modeloLegado);
  const anthropic = config.provider === "anthropic";
  const response = await fetch(`${config.baseURL}/${anthropic ? "messages" : "chat/completions"}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(45000),
    headers: anthropic
      ? { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
      : { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(anthropic ? {
      model: config.model,
      max_tokens: 2048,
      system: messages.filter(m => m.role === "system").map(m => {
        if (typeof m.content !== "string") throw new ErroIAAgente("ia_resposta_invalida");
        return m.content;
      }).join("\n\n"),
      messages: messages.filter(m => m.role !== "system").map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content.map(part =>
          part.type === "text" ? part : { type: "image", source: { type: "url", url: part.image_url.url } }),
      })),
      ...(schema ? { output_config: { format: { type: "json_schema", schema: schemaParaClaude(schema) } } } : {}),
    } : { model: config.model, messages }),
  });
  if (!response.ok) {
    // Provider bodies may contain prompts, credentials or contact data. Never log them.
    await response.body?.cancel().catch(() => undefined);
    const codigo = response.status === 402 ? "ia_creditos_esgotados"
      : response.status === 429 ? "ia_limite_uso"
      : response.status === 401 || response.status === 403 ? "ia_acesso_negado"
      : response.status === 404 ? "ia_modelo_indisponivel" : "ia_indisponivel";
    throw new ErroIAAgente(codigo);
  }
  const data = await response.json();
  if (anthropic && data?.stop_reason !== "end_turn") throw new ErroIAAgente("ia_resposta_invalida");
  const content = anthropic
    ? data?.content?.filter((part: { type?: string; text?: unknown }) => part.type === "text" && typeof part.text === "string").map((part: { text: string }) => part.text).join("")
    : data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new ErroIAAgente("ia_resposta_invalida");
  const tokens = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  return { texto: content.trim(), tokensEntrada: tokens(anthropic ? data.usage?.input_tokens : data.usage?.prompt_tokens), tokensSaida: tokens(anthropic ? data.usage?.output_tokens : data.usage?.completion_tokens) };
}
