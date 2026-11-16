import { generateText, Output, zodSchema } from "ai";
import { configurarProvedorIA, gerarChatIA } from "./ia-provedor.server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resultadoAgenteSchema, type MensagemAgente } from "./mimo-agente";
import { codigoFalhaAgente, ErroIAAgente } from "./mimo-agente-diagnostico";
import { metricaFalhaAgente, registrarGeracaoAgente } from "./mimo-agente-observabilidade.server";

/** Only MiMo uses this adapter. The legacy/personal sales AI keeps its existing transport. */
export async function chamarIAAgente(prompt: string, mensagens: MensagemAgente[]): Promise<string> {
  const inicio = Date.now();
  try {
    const config = configurarProvedorIA("agente");
    if (config.provider === "anthropic") {
      const schema = await zodSchema(resultadoAgenteSchema).jsonSchema;
      const r = await gerarChatIA([{ role: "system", content: prompt }, ...mensagens], "agente", undefined, schema);
      const output = resultadoAgenteSchema.parse(JSON.parse(r.texto));
      await registrarGeracaoAgente({ resultado: "sucesso", duracaoMs: Date.now() - inicio, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida });
      return JSON.stringify(output);
    }
    const provider = createOpenAICompatible({
      name: config.provider,
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      fetch: (url, init) => fetch(url, { ...init, redirect: "error" }),
    });
    const r = await generateText({
      model: provider.chatModel(config.model),
      system: prompt,
      messages: mensagens,
      output: Output.object({ schema: resultadoAgenteSchema }),
      // No hidden HTTP retries: one queue reservation cannot replay an uncertain operation.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(45000),
      experimental_telemetry: { isEnabled: false },
    });
    const output = resultadoAgenteSchema.parse(r.output);
    await registrarGeracaoAgente({
      resultado: "sucesso",
      duracaoMs: Date.now() - inicio,
      tokensEntrada: r.usage.inputTokens,
      tokensSaida: r.usage.outputTokens,
    });
    return JSON.stringify(output);
  } catch (erro) {
    const codigo = codigoFalhaAgente(erro);
    const seguro = new ErroIAAgente(codigo === "processamento_falhou" ? "ia_indisponivel" : codigo);
    await registrarGeracaoAgente(metricaFalhaAgente(seguro, Date.now() - inicio));
    throw seguro;
  }
}
