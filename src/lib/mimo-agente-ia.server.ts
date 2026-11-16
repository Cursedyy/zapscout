import { generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resultadoAgenteSchema, type MensagemAgente } from "./mimo-agente";
import { codigoFalhaAgente, ErroIAAgente } from "./mimo-agente-diagnostico";
import { metricaFalhaAgente, registrarGeracaoAgente } from "./mimo-agente-observabilidade.server";

/** Only MiMo uses this adapter. The legacy/personal sales AI keeps its existing transport. */
export async function chamarIAAgente(prompt: string, mensagens: MensagemAgente[]): Promise<string> {
  const inicio = Date.now();
  try {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey?.trim()) throw new ErroIAAgente("ia_sem_credencial");
    const provider = createOpenAICompatible({
      name: "lovable", baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
    });
    const r = await generateText({
      model: provider.chatModel("google/gemini-2.5-flash"),
      system: prompt, messages: mensagens,
      output: Output.object({ schema: resultadoAgenteSchema }),
      // No hidden HTTP retries: one queue reservation cannot replay an uncertain operation.
      maxRetries: 0, abortSignal: AbortSignal.timeout(45000),
      experimental_telemetry: { isEnabled: false },
    });
    const output = resultadoAgenteSchema.parse(r.output);
    await registrarGeracaoAgente({ resultado: "sucesso", duracaoMs: Date.now() - inicio,
      tokensEntrada: r.usage.inputTokens, tokensSaida: r.usage.outputTokens });
    return JSON.stringify(output);
  } catch (erro) {
    const codigo = codigoFalhaAgente(erro);
    const seguro = new ErroIAAgente(codigo === "processamento_falhou" ? "ia_indisponivel" : codigo);
    await registrarGeracaoAgente(metricaFalhaAgente(seguro, Date.now() - inicio));
    throw seguro;
  }
}
