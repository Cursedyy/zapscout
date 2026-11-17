import { afterEach, expect, it, vi } from "vitest";
const capturas = vi.hoisted(() => ({
  spans: [] as { name: string; attributes: Record<string, unknown> }[],
  params: [] as Record<string, unknown>[],
  falhar: false,
}));
// Use the real OpenTelemetry provider, replacing only the external exporting processor.
vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: class {
    constructor(params: Record<string, unknown>) {
      capturas.params.push(params);
    }
    onStart() {}
    onEnd(span: { name: string; attributes: Record<string, unknown> }) {
      capturas.spans.push(span);
    }
    async forceFlush() {
      if (capturas.falhar) throw Error("falha privada de telemetria");
    }
    async shutdown() {}
  },
}));
import { registrarGeracaoAgente } from "./mimo-agente-observabilidade.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  capturas.spans.length = 0;
  capturas.params.length = 0;
  capturas.falhar = false;
});
it("indisponibilidade da telemetria não interrompe a geração nem revela o erro original", async () => {
  vi.stubEnv("MIMO_LANGFUSE_ENABLED", "true");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-sintetica");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-sintetica");
  vi.stubEnv("LANGFUSE_BASE_URL", "https://telemetria.invalid");
  capturas.falhar = true;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(
    registrarGeracaoAgente({ resultado: "sucesso", duracaoMs: 10 }),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith("[mimo-agente] telemetria_indisponivel");
  expect(JSON.stringify(warn.mock.calls)).not.toContain("falha privada");
});
it("exporta apenas métricas permitidas, por provider isolado e sem conteúdo de conversa", async () => {
  vi.stubEnv("MIMO_LANGFUSE_ENABLED", "true");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-sintetica");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-sintetica");
  vi.stubEnv("LANGFUSE_BASE_URL", "https://telemetria.invalid");
  await registrarGeracaoAgente({
    resultado: "falha",
    duracaoMs: 100,
    codigo: "ia_creditos_esgotados",
  });
  await registrarGeracaoAgente({
    resultado: "sucesso",
    duracaoMs: 200,
    tokensEntrada: 15,
    tokensSaida: 5,
  });
  expect(capturas.spans).toHaveLength(2);
  expect(capturas.params).toHaveLength(2);
  expect(capturas.params[0]).toMatchObject({
    timeout: 1,
    exportMode: "immediate",
    mediaUploadEnabled: false,
  });
  expect(Object.keys(capturas.spans[0].attributes).sort()).toEqual(
    [
      "gen_ai.request.model",
      "langfuse.observation.type",
      "mimo.codigo",
      "mimo.duracao_ms",
      "mimo.resultado",
    ].sort(),
  );
  expect(JSON.stringify(capturas.spans.map((s) => s.attributes))).not.toMatch(
    /sk-sintetica|pk-sintetica|prompt|telefone|mensagem|cliente/,
  );
});
