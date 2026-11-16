import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chamarIAAgente } from "./mimo-agente-ia.server";

const fetchMock = vi.fn();
const aprovado = { resposta: "Olá! Você já revende ou está começando?", dados: {}, encaminhar: false, motivo: "" };
const retorno = (content: string) => Response.json({
  id: "synthetic-completion", created: 1, model: "google/gemini-2.5-flash", object: "chat.completion",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
});
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LOVABLE_API_KEY", "chave-sintetica");
  vi.stubEnv("MIMO_LANGFUSE_ENABLED", "false");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("usa o SDK real com HTTP simulado, gateway existente e saída validada", async () => {
  fetchMock.mockResolvedValue(retorno(JSON.stringify(aprovado)));
  expect(JSON.parse(await chamarIAAgente("Instrução sintética", [{ role: "user", content: "Quero revender" }]))).toEqual(aprovado);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
  const body = JSON.parse(request.body);
  expect(body.model).toBe("google/gemini-2.5-flash");
  expect(body.messages).toEqual([{ role: "system", content: expect.stringContaining("Instrução sintética") }, { role: "user", content: "Quero revender" }]);
  expect(body.tools).toBeUndefined();
});
it.each([[402, "créditos"], [429, "limitou"], [401, "credencial"], [404, "modelo"]])(
  "HTTP %i produz erro seguro e nenhuma repetição automática", async (status, trecho) => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "corpo confidencial; token=secreto" } }, { status: Number(status) }));
    await expect(chamarIAAgente("prompt privado", [{ role: "user", content: "mensagem privada" }])).rejects.toThrow(new RegExp(String(trecho), "i"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it.each(["não é JSON", JSON.stringify({ ...aprovado, ferramenta: "enviar" }), JSON.stringify({ resposta: "olá" })])(
  "recusa saída fora do schema sem reenviar ao modelo", async content => {
    fetchMock.mockResolvedValue(retorno(content));
    await expect(chamarIAAgente("prompt", [{ role: "user", content: "oi" }])).rejects.toThrow("formato aprovado");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
it("sem credencial não chama provedor", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "");
  await expect(chamarIAAgente("prompt", [{ role: "user", content: "oi" }])).rejects.toThrow("chave");
  expect(fetchMock).not.toHaveBeenCalled();
});
