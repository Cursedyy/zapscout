import { chamarLovableAI } from "./ia.server";
import {
  finalizarResultadoAgente,
  motivoObrigatorioAgente,
  promptAgente,
  respostaEncaminhamento,
  ultimoBlocoAgente,
  type ConfigAgente,
  type DadosAgente,
  type MensagemAgente,
} from "./mimo-agente";
export async function gerarRespostaAgente(
  config: ConfigAgente,
  mensagens: MensagemAgente[],
  dados: DadosAgente,
) {
  const ultima = ultimoBlocoAgente(mensagens);
  const motivo = motivoObrigatorioAgente(ultima);
  if (motivo)
    return finalizarResultadoAgente(config, mensagens, dados, {
      resposta: respostaEncaminhamento(config, motivo),
      dados: {},
      encaminhar: true,
      motivo,
    });
  const bruto = await chamarLovableAI(promptAgente(config, dados), mensagens);
  return finalizarResultadoAgente(
    config,
    mensagens,
    dados,
    JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, "")),
  );
}
