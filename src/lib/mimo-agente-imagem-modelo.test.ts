import { afterEach, expect, it, vi } from "vitest";
import { configInicialAgente } from "./mimo-agente";
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";
import { chamarClaude } from "./claude.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const mensagemClaude = (text: string) => ({
  id: "msg_sintetica",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

it("envia os bytes da foto na mesma mensagem da legenda e exige evidência textual", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "chave-sintetica");
  const resposta = "Na foto aparece uma embalagem. O que você gostaria de saber sobre ela?";
  const content = JSON.stringify({ resposta, dados: { nome: { valor: "Ana", evidencia: "Sou Ana" } }, encaminhar: false });
  const fetcher = vi.fn().mockResolvedValue(Response.json(mensagemClaude(content)));
  vi.stubGlobal("fetch", fetcher);
  const r = await gerarRespostaAgente(configInicialAgente, [{
    role: "user", content: "Oi",
    imagem: { mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71) },
  }], {});
  expect(r).toMatchObject({ resposta, dados: {}, estado: "agente" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.model).toBe("claude-haiku-5-5");
  expect(body.messages[0]).toEqual({
    role: "user",
    content: [
      { type: "text", text: "Oi" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw==" } },
    ],
  });
});

it("protege o corpo de erro quando a requisição inclui imagem", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "chave-sintetica");
  const fetcher = vi.fn().mockResolvedValue(Response.json(
    { type: "error", error: { type: "invalid_request_error", message: "imagem e texto privados" } },
    { status: 400 },
  ));
  vi.stubGlobal("fetch", fetcher);
  await expect(gerarRespostaAgente(configInicialAgente, [{
    role: "user", content: "Consegue identificar?",
    imagem: { mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71) },
  }], {})).rejects.toThrow(/^Erro IA \(400\) ao analisar imagem\.$/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("começa e termina a conversa com o cliente, como a API exige", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "chave-sintetica");
  const content = JSON.stringify({ resposta: "Você já tem uma loja?", dados: {}, encaminhar: false });
  const fetcher = vi.fn().mockResolvedValue(Response.json(mensagemClaude(content)));
  vi.stubGlobal("fetch", fetcher);
  await chamarClaude("sistema", [
    { role: "assistant", content: "Oi! Posso ajudar com a MiMo?" },
    { role: "user", content: "Quero revender" },
    { role: "assistant", content: "Como você se chama?" },
  ]);
  const { messages } = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
});
