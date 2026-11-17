import { afterEach, expect, it, vi } from "vitest";
import { metricaFalhaAgente, registrarGeracaoAgente } from "./mimo-agente-observabilidade.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sem ativação explícita não importa SDKs nem envia telemetria", async () => {
  vi.stubEnv("MIMO_LANGFUSE_ENABLED", "false");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await registrarGeracaoAgente({ resultado: "sucesso", duracaoMs: 10 });
  expect(fetch).not.toHaveBeenCalled();
});
it("credencial ausente ou URL insegura não exporta dados nem impede atendimento", async () => {
  vi.stubEnv("MIMO_LANGFUSE_ENABLED", "true");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-teste");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "");
  await expect(
    registrarGeracaoAgente({ resultado: "sucesso", duracaoMs: 1 }),
  ).resolves.toBeUndefined();
  vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-teste");
  vi.stubEnv("LANGFUSE_BASE_URL", "http://inseguro.invalid");
  await expect(
    registrarGeracaoAgente({ resultado: "sucesso", duracaoMs: 1 }),
  ).resolves.toBeUndefined();
});
it("a métrica de falha contém somente duração e código permitido", () => {
  expect(metricaFalhaAgente(Error("conteudo de cliente; credencial secreta"), 150)).toEqual({
    resultado: "falha",
    duracaoMs: 150,
    codigo: "processamento_falhou",
  });
});
