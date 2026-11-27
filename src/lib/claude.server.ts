import Anthropic from "@anthropic-ai/sdk";

export const MODELO_CLAUDE_AGENTE = "claude-haiku-5-5";

export type MensagemClaude =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<{ type: "text"; text: string } | { type: "image"; mime: string; base64: string }>;
    };

const MIMES_IMAGEM = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MimeImagem = (typeof MIMES_IMAGEM)[number];

// The API requires the conversation to start and end with the customer; WhatsApp
// history may open with a proactive MiMo message or end with one.
const INICIO = "[Início da conversa]";
const SEM_RESPOSTA = "[O cliente ainda não respondeu à última mensagem]";

function conteudoClaude(content: MensagemClaude["content"]): Anthropic.MessageParam["content"] {
  if (typeof content === "string") return content;
  return content.map((parte): Anthropic.ContentBlockParam => {
    if (parte.type === "text") return { type: "text", text: parte.text };
    const mime = parte.mime.toLowerCase() === "image/jpg" ? "image/jpeg" : parte.mime.toLowerCase();
    if (!MIMES_IMAGEM.includes(mime as MimeImagem))
      throw new Error("A imagem da conversa está em formato inválido.");
    return { type: "image", source: { type: "base64", media_type: mime as MimeImagem, data: parte.base64 } };
  });
}

function vazia(content: MensagemClaude["content"]) {
  return typeof content === "string" ? !content.trim() : content.length === 0;
}

export async function chamarClaude(
  systemPrompt: string,
  mensagens: MensagemClaude[],
  model = MODELO_CLAUDE_AGENTE,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada no servidor.");
  const temImagem = mensagens.some((m) => Array.isArray(m.content));

  const messages: Anthropic.MessageParam[] = mensagens
    .filter((m) => !vazia(m.content))
    .map((m) => ({ role: m.role, content: conteudoClaude(m.content) }));
  if (!messages.length) throw new Error("A conversa não contém mensagens para analisar.");
  if (messages[0].role === "assistant") messages.unshift({ role: "user", content: INICIO });
  if (messages[messages.length - 1].role === "assistant")
    messages.push({ role: "user", content: SEM_RESPOSTA });

  const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  let resposta: Anthropic.Message;
  try {
    resposta = await client.messages.create({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages,
    });
  } catch (erro) {
    // Never surface provider bodies: they can echo private conversation content.
    if (erro instanceof Anthropic.RateLimitError) throw new Error("Limite de uso da API Claude atingido.");
    if (erro instanceof Anthropic.AuthenticationError || erro instanceof Anthropic.PermissionDeniedError)
      throw new Error("A chave da API Claude foi recusada.");
    if (erro instanceof Anthropic.BadRequestError && temImagem)
      throw new Error("Erro IA (400) ao analisar imagem.");
    if (erro instanceof Anthropic.APIError)
      throw new Error("Erro na API Claude (" + (erro.status ?? "sem status") + ").");
    throw erro;
  }

  if (resposta.stop_reason === "refusal") throw new Error("A API Claude recusou a resposta.");
  if (resposta.stop_reason === "max_tokens") throw new Error("A API Claude excedeu o limite de resposta.");
  const texto = resposta.content
    .map((bloco) => (bloco.type === "text" ? bloco.text : ""))
    .join("")
    .trim();
  if (!texto) throw new Error("A API Claude não retornou texto (" + resposta.stop_reason + ").");
  return texto;
}
