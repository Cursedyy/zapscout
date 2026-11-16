import { codigoFalhaAgente, type CodigoFalhaAgente } from "./mimo-agente-diagnostico";

export type MetricaGeracaoAgente = {
  duracaoMs: number;
  resultado: "sucesso" | "falha";
  codigo?: CodigoFalhaAgente;
  tokensEntrada?: number;
  tokensSaida?: number;
};
/** Manual, isolated spans. No global SDK instrumentation, prompts, messages or identities. */
export async function registrarGeracaoAgente(metrica: MetricaGeracaoAgente) {
  if (process.env.MIMO_LANGFUSE_ENABLED !== "true") return;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) return;
  let provider: { shutdown(): Promise<void> } | undefined;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return;
    const [{ LangfuseSpanProcessor }, { BasicTracerProvider }, { SpanStatusCode, ROOT_CONTEXT }] =
      await Promise.all([
        import("@langfuse/otel"),
        import("@opentelemetry/sdk-trace-base"),
        import("@opentelemetry/api"),
      ]);
    const tracing = new BasicTracerProvider({
      spanProcessors: [
        new LangfuseSpanProcessor({
          publicKey,
          secretKey,
          baseUrl: baseUrl.replace(/\/+$/, ""),
          timeout: 1,
          exportMode: "immediate",
          compression: "none",
          mediaUploadEnabled: false,
          environment: "mimo",
          release: "mimo-ai-sdk-1",
          shouldExportSpan: ({ otelSpan }) => otelSpan.name === "mimo-agente.geracao",
        }),
      ],
    });
    provider = tracing;
    const fim = Date.now();
    const span = tracing.getTracer("mimo-agente").startSpan(
      "mimo-agente.geracao",
      {
        startTime: fim - metrica.duracaoMs,
        attributes: {
          "langfuse.observation.type": "generation",
          "gen_ai.request.model": "google/gemini-2.5-flash",
          "mimo.resultado": metrica.resultado,
          "mimo.duracao_ms": metrica.duracaoMs,
          ...(metrica.codigo ? { "mimo.codigo": metrica.codigo } : {}),
          ...(metrica.tokensEntrada !== undefined
            ? { "gen_ai.usage.input_tokens": metrica.tokensEntrada }
            : {}),
          ...(metrica.tokensSaida !== undefined
            ? { "gen_ai.usage.output_tokens": metrica.tokensSaida }
            : {}),
        },
      },
      ROOT_CONTEXT,
    );
    span.setStatus({
      code: metrica.resultado === "sucesso" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      ...(metrica.codigo ? { message: metrica.codigo } : {}),
    });
    span.end(fim);
    await tracing.forceFlush();
  } catch {
    // Telemetry must never change generation, queue state, or send eligibility.
    console.warn("[mimo-agente] telemetria_indisponivel");
  } finally {
    await provider?.shutdown().catch(() => {});
  }
}
export function metricaFalhaAgente(erro: unknown, duracaoMs: number): MetricaGeracaoAgente {
  return { resultado: "falha", duracaoMs, codigo: codigoFalhaAgente(erro) };
}
