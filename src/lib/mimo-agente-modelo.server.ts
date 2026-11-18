import { chamarLovableAI } from "./ia.server";
import {contextoAprendizadoAgente} from './mimo-agente-aprendizado';
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
  aprendizado?: unknown,
  catalogoApresentado = false,
) {
  const deterministica = respostaDeterministicaAgente(config, mensagens, dados, catalogoApresentado, true);
  if (deterministica) return deterministica;
  const prompt = promptAgente(config, dados)+contextoAprendizadoAgente(aprendizado);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const bruto = await chamarLovableAI(
      tentativa === 0
        ? prompt
        : `${prompt}\nA tentativa anterior foi rejeitada pela validação do servidor. Reformule de forma curta, sem links, valores ou condições comerciais, inclusive ao mencioná-los como exemplos ou ressalvas. Não afirme que enviou ou vai anexar um arquivo. Retome do último passo da conversa. Não antecipe informações de pagamento ou entrega. Se a dúvida depender dessas informações, indique encaminhamento à equipe.`,
      mensagens,
    );
    try {
      return finalizarResultadoAgente(
        config,
        mensagens,
        dados,
        JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, "")),
        new Date(), catalogoApresentado, true,
      );
    } catch (erro) {
      // Retry only a rejected reply, never transport, parsing or schema failures.
      if (!(erro instanceof Error) || erro.message !== "agente_resposta_nao_aprovada") throw erro;
    }
  }
  // Both drafts remain private. The same finalizer enforces a real human handoff.
  return finalizarResultadoAgente(config, mensagens, dados, {
    resposta: "Sua solicitação precisa de revisão pela equipe da MiMo.",
    dados: {},
    encaminhar: true,
    motivo: "resposta_nao_aprovada",
  });
}
