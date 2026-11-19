export type ParteMensagemGemini =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type MensagemGemini =
  | { role: "user" | "assistant"; content: string }
  | { role: "user"; content: ParteMensagemGemini[] };

type GeminiResposta = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

function partesGemini(content: string | ParteMensagemGemini[]) {
  if (typeof content === "string") return [{ text: content }];
  return content.map((part) => {
    if (part.type === "text") return { text: part.text };
    const match = part.image_url.url.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
    if (!match) throw new Error("A imagem da conversa está em formato inválido.");
    return { inlineData: { mimeType: match[1], data: match[2] } };
  });
}

export async function chamarGemini(
  systemPrompt: string,
  mensagens: MensagemGemini[],
  model = "gemini-3.6-flash",
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no servidor.");

  const modelo = model.replace(/^google\//i, "");
  if (!/^[a-z0-9.-]+$/i.test(modelo)) throw new Error("Modelo Gemini inválido.");
  const contents = mensagens
    .map((mensagem) => ({
      role: mensagem.role === "assistant" ? "model" : "user",
      parts: partesGemini(mensagem.content),
    }))
    .filter((mensagem) => mensagem.parts.length > 0);
  if (!contents.length) throw new Error("A conversa não contém mensagens para analisar.");

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(modelo) +
      ":generateContent",
    {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    },
  );

  let data: GeminiResposta;
  try {
    data = (await res.json()) as GeminiResposta;
  } catch {
    throw new Error("A API Gemini retornou uma resposta inválida.");
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("Limite de uso da API Gemini atingido.");
    if (res.status === 401 || res.status === 403)
      throw new Error("A chave da API Gemini foi recusada.");
    throw new Error(
      "Erro na API Gemini (" +
        res.status +
        "): " +
        String(data.error?.message ?? "falha sem detalhes").slice(0, 200),
    );
  }

  const texto = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!texto) {
    throw new Error(
      "A API Gemini não retornou texto" +
        (data.candidates?.[0]?.finishReason
          ? " (" + data.candidates[0].finishReason + ")"
          : "."),
    );
  }
  return texto;
}
