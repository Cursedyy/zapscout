import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chamarIAAgente } from "./mimo-agente-ia.server";

const fetchMock = vi.fn();
const aprovado = {
  resposta: "Olá! Você já revende ou está começando?",
  dados: {},
  encaminhar: false,
  motivo: "",
};
const retorno = (content: string) =>
  Response.json({
    id: "synthetic-completion",
    created: 1,
    model: "google/gemini-2.5-flash",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  });
beforeEach(() => {
  vi.stubEnv("IA_PROVIDER", "");
  vi.stubEnv("IA_MODEL", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LOVABLE_API_KEY", "chave-sintetica");
  vi.stubEnv("MIMO_LANGFUSE_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("usa o SDK real com HTTP simulado, gateway existente e saída validada", async () => {
  fetchMock.mockResolvedValue(retorno(JSON.stringify(aprovado)));
  expect(
    JSON.parse(
      await chamarIAAgente("Instrução sintética", [{ role: "user", content: "Quero revender" }]),
    ),
  ).toEqual(aprovado);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(String(url)).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
  const body = JSON.parse(request.body);
  expect(body.model).toBe("google/gemini-2.5-flash");
  expect(body.messages).toEqual([
    { role: "system", content: expect.stringContaining("Instrução sintética") },
    { role: "user", content: "Quero revender" },
  ]);
  expect(body.tools).toBeUndefined();
});
it.each([
  [402, "créditos"],
  [429, "limitou"],
  [401, "credencial"],
  [404, "modelo"],
])("HTTP %i produz erro seguro e nenhuma repetição automática", async (status, trecho) => {
  fetchMock.mockResolvedValue(
    Response.json(
      { error: { message: "corpo confidencial; token=secreto" } },
      { status: Number(status) },
    ),
  );
  await expect(
    chamarIAAgente("prompt privado", [{ role: "user", content: "mensagem privada" }]),
  ).rejects.toThrow(new RegExp(String(trecho), "i"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each([
  "não é JSON",
  JSON.stringify({ ...aprovado, ferramenta: "enviar" }),
  JSON.stringify({ resposta: "olá" }),
])("recusa saída fora do schema sem reenviar ao modelo", async (content) => {
  fetchMock.mockResolvedValue(retorno(content));
  await expect(chamarIAAgente("prompt", [{ role: "user", content: "oi" }])).rejects.toThrow(
    "formato aprovado",
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("sem credencial não chama provedor", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "");
  await expect(chamarIAAgente("prompt", [{ role: "user", content: "oi" }])).rejects.toThrow(
    "chave",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("Claude nativo recebe schema derivado do contrato real e saída continua validada", async () => {
  vi.stubEnv("IA_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sintetica-claude");
  vi.stubEnv("IA_MODEL", "modelo-sintetico");
  fetchMock.mockResolvedValue(Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(aprovado) }], usage: { input_tokens: 20, output_tokens: 10 } }));
  expect(JSON.parse(await chamarIAAgente("Instrução sintética", [{ role: "user", content: "Quero revender" }]))).toEqual(aprovado);
  const [url, req] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.anthropic.com/v1/messages");
  const body = JSON.parse(req.body);
  expect(body.output_config.format.type).toBe("json_schema");
  expect(body.output_config.format.schema.properties.resposta.type).toBe("string");
  expect(body.output_config.format.schema.additionalProperties).toBe(false);
  expect(req.headers.Authorization).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("Claude escolhido sem chave própria nunca usa saldo Lovable", async () => {
  vi.stubEnv("IA_PROVIDER", "anthropic");
  vi.stubEnv("IA_MODEL", "modelo-sintetico");
  await expect(chamarIAAgente("Instrução", [{ role: "user", content: "Oi" }])).rejects.toThrow("chave");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("Claude com JSON válido mas dado fora do contrato não passa nem repete", async () => {
  vi.stubEnv("IA_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sintetica-claude");
  vi.stubEnv("IA_MODEL", "modelo-sintetico");
  fetchMock.mockResolvedValue(Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ ...aprovado, resposta: "x".repeat(801) }) }] }));
  await expect(chamarIAAgente("Instrução", [{ role: "user", content: "Oi" }])).rejects.toThrow("formato aprovado");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
