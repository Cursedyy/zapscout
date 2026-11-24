import { Buffer } from "node:buffer";
import { chamarGemini, type MensagemGemini } from "./gemini.server";
import type { ImagemWhatsApp } from "./uazapi.server";
import {contextoAprendizadoAgente} from './mimo-agente-aprendizado';
import {
  finalizarResultadoAgente,
  coletaEncaminhamentoPendenteAgente,
  respostaContingenciaAgente,
  respostaDeterministicaAgente,
  contextoCriativoAgente,
  type AssuntoCriativoAgente,
  promptAgente,
  revisaoRespostaAgente,
  type ConfigAgente,
  type DadosAgente,
  type MensagemAgente,
} from "./mimo-agente";
export type MensagemAgenteComImagem = MensagemAgente & { imagem?: ImagemWhatsApp };

export async function gerarRespostaAgente(
  config: ConfigAgente,
  mensagens: MensagemAgenteComImagem[],
  dados: DadosAgente,
  aprendizado?: unknown,
  catalogoApresentado = false,
  criativo: AssuntoCriativoAgente | null = null,
) {
  const temImagem = mensagens.some((m) => m.role === "user" && m.imagem);
  const deterministica = respostaDeterministicaAgente(config, mensagens, dados, catalogoApresentado, true, temImagem, criativo);
  let revisao = deterministica ? revisaoRespostaAgente(mensagens, deterministica) : null;
  const coletandoParaEncaminhar = deterministica && coletaEncaminhamentoPendenteAgente([
    { role: "assistant", content: deterministica.resposta },
  ]);
  if (deterministica && !coletandoParaEncaminhar && (!revisao || deterministica.estado !== "agente")) {
    return deterministica;
  }
  const instrucoesRevisao = () => revisao === "dado_ja_informado"
    ? "A conversa já contém o dado que você tentou pedir. Use a informação do cliente e avance."
    : revisao === "repeticao"
      ? "A conversa já contém a mesma resposta ou pergunta. Retome a dúvida pendente ou faça uma clarificação específica, sem reformular a pergunta repetida."
      : "";
  const mensagensGemini = mensagens.map((m): MensagemGemini => {
    if (m.role !== "user" || !m.imagem) return { role: m.role, content: m.content };
    const base64 = Buffer.from(m.imagem.bytes).toString("base64");
    return {
      role: "user",
      content: [
        ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
        { type: "image_url", image_url: { url: `data:${m.imagem.mime};base64,${base64}` } },
      ],
    };
  });
  const prompt = promptAgente(config, dados)+contextoCriativoAgente(criativo)+contextoAprendizadoAgente(aprendizado);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const bruto = await chamarGemini(
      tentativa === 0
        ? `${prompt}\n${instrucoesRevisao()}`
        : `${prompt}\nA tentativa anterior foi rejeitada pela validação do servidor. Reformule de forma curta, sem links, valores ou condições comerciais, inclusive ao mencioná-los como exemplos ou ressalvas. Não afirme que enviou ou vai anexar um arquivo. Retome do último passo da conversa e peça apenas o próximo dado básico que ainda faltar. Não antecipe informações de pagamento ou entrega. ${instrucoesRevisao()}`,
      mensagensGemini,
    );
    try {
      const resultado = finalizarResultadoAgente(
        config,
        mensagens,
        dados,
        JSON.parse(bruto.replace(/^```(?:json)?\s*|\s*```$/g, "")),
        new Date(), catalogoApresentado, true,
      );
      revisao = revisaoRespostaAgente(mensagens, resultado);
      if (!revisao) return resultado;
    } catch (erro) {
      // Retry only a rejected reply, never transport, parsing or schema failures.
      if (!(erro instanceof Error) || erro.message !== "agente_resposta_nao_aprovada") throw erro;
    }
  }
  return respostaContingenciaAgente(config, mensagens, dados, catalogoApresentado, temImagem);
}
