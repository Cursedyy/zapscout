import { chamarLovableAI } from "./ia.server";
import {
  finalizarResultadoAgente,
  respostaDeterministicaAgente,
  promptAgente,
  type ConfigAgente,
  type DadosAgente,
  type MensagemAgente,
} from "./mimo-agente";
export async function gerarRespostaAgente(
  config: ConfigAgente,
  mensagens: MensagemAgente[],
  dados: DadosAgente,
) {
  const deterministica = respostaDeterministicaAgente(config, mensagens, dados);
  if (deterministica) return deterministica;
  const bruto = await chamarLovableAI(promptAgente(config, dados), mensagens);
  return finalizarResultadoAgente(
    config,
    mensagens,
    dados,
    JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, "")),
  );
}
