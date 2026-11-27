export const PERGUNTA_ASSUNTO_AGENTE = "O que melhor descreve você?";
/** Text of the agent's follow-up button message carrying options 4+ (see uazSendMenu). */
export const TEXTO_MAIS_OPCOES = "Ou escolha uma destas:";
export const PERGUNTA_NOME_AGENTE = "Como você se chama?";
export const PERGUNTA_UF_DISTRIBUICAO_AGENTE = "Em qual estado você pretende distribuir?";
export const PERGUNTA_REVENDA_AGENTE = "Você tem interesse em revender os produtos da MiMo?";
export const PERGUNTA_RAMO_AGENTE = "Qual é o seu ramo de atuação?";
/** Distributors already said what they are; asking with resale niche buttons made leads
 * pick the wrong option. Free-text question, still recognized as the branch question. */
export const PERGUNTA_RAMO_DISTRIBUICAO_AGENTE = "Qual é o ramo de atuação da sua distribuidora?";
export const PERGUNTA_MARKETING_AGENTE =
  "Claro! Seu contato com o marketing é sobre parceria como influenciador(a) ou sobre outro assunto?";
export const PERGUNTA_PARCERIA_AGENTE =
  "Entendi que você quer saber sobre parceria com a MiMo. Você pensa em divulgar a marca ou tem outro formato em mente?";
export const OUTRO_ASSUNTO_AGENTE = "Outro assunto";
// Internal answer texts stay stable ("Quero revender", "Quero distribuir"...) so the agent rules keep
// working; only the button labels describe who the lead is. WhatsApp caps button titles at 20 chars.
const distribuir = { id: "mimo_quero_distribuir", rotulo: "Distribuidor(a)", resposta: "Quero distribuir" };

export function querDistribuirAgente(texto: string) {
  return texto.trim().replace(/[!.]+$/, "").toLowerCase() === distribuir.resposta.toLowerCase();
}

const revenda = { id: "mimo_revenda", rotulo: "Quero revender" };
const revendedor = { ...revenda, rotulo: "Revendedor(a)", resposta: revenda.rotulo };
const outro = { id: "mimo_outro_assunto", rotulo: OUTRO_ASSUNTO_AGENTE };
const influencia = { id: "mimo_influencia", rotulo: "Sou influenciador(a)", resposta: "Quero parceria como influenciador" };
const menus: { pergunta: string; opcoes: { id: string; rotulo: string; resposta?: string }[] }[] = [
  { pergunta: PERGUNTA_ASSUNTO_AGENTE, opcoes: [
    revendedor,
    distribuir,
    { id: "mimo_representacao", rotulo: "Representante", resposta: "Quero ser representante" },
    { ...influencia, rotulo: "Influenciador(a)" },
    { id: "mimo_consumo", rotulo: "Consumidor(a) final", resposta: "Consumo próprio" },
  ] },
  { pergunta: PERGUNTA_REVENDA_AGENTE, opcoes: [revenda, outro] },
  { pergunta: PERGUNTA_RAMO_AGENTE, opcoes: [
    { id: "mimo_emporio", rotulo: "Empório" },
    { id: "mimo_mercado", rotulo: "Mercado" },
    { id: "mimo_padaria", rotulo: "Padaria" },
    { id: "mimo_farmacia", rotulo: "Farmácia" },
  ] },
  { pergunta: PERGUNTA_MARKETING_AGENTE, opcoes: [influencia, outro] },
  { pergunta: PERGUNTA_PARCERIA_AGENTE, opcoes: [influencia, outro] },
];

const respostas = new Map(menus.flatMap(({ opcoes }) =>
  opcoes.map(opcao => [opcao.id, opcao.resposta ?? opcao.rotulo] as const),
));

export function textoOpcaoAgente(id: unknown) {
  return typeof id === "string" ? respostas.get(id) : undefined;
}

export function opcoesPerguntaAgente(texto: string) {
  return menus.find(({ pergunta }) => texto.endsWith(pergunta))?.opcoes
    .map(({ rotulo, id }) => `${rotulo}|${id}`);
}

