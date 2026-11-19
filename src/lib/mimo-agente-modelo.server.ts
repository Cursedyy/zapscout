import { Buffer } from "node:buffer";
import { chamarLovableAI, type MensagemLovable } from "./ia.server";
import type { ImagemWhatsApp } from "./uazapi.server";
import {contextoAprendizadoAgente} from './mimo-agente-aprendizado';
import {
  finalizarResultadoAgente,
  respostaDeterministicaAgente,
  promptAgente,
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
) {
  const temImagem = mensagens.some((m) => m.role === "user" && m.imagem);
  const deterministica = respostaDeterministicaAgente(config, mensagens, dados, catalogoApresentado, true, temImagem);
  if (deterministica) return deterministica;
  const mensagensGateway = mensagens.map((m): MensagemLovable => {
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
  const prompt = promptAgente(config, dados)+contextoAprendizadoAgente(aprendizado);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const bruto = await chamarLovableAI(
      tentativa === 0
        ? prompt
        : `${prompt}\nA tentativa anterior foi rejeitada pela validação do servidor. Reformule de forma curta, sem links, valores ou condições comerciais, inclusive ao mencioná-los como exemplos ou ressalvas. Não afirme que enviou ou vai anexar um arquivo. Retome do último passo da conversa. Não antecipe informações de pagamento ou entrega. Se a dúvida depender dessas informações, indique encaminhamento à equipe.`,
      mensagensGateway,
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
