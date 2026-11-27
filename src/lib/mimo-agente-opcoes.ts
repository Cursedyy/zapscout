export const PERGUNTA_ASSUNTO_AGENTE = "Como você quer seguir com a MiMo?";
/** Text of the agent's follow-up button message carrying options 4+ (see uazSendMenu). */
export const TEXTO_MAIS_OPCOES = "Ou escolha uma destas:";
export const PERGUNTA_NOME_AGENTE = "Como você se chama?";
export const PERGUNTA_UF_DISTRIBUICAO_AGENTE = "Em qual estado você pretende distribuir?";
export const PERGUNTA_REVENDA_AGENTE = "Você tem interesse em revender os produtos da MiMo?";
export const PERGUNTA_RAMO_AGENTE = "Qual é o seu ramo de atuação?";
export const PERGUNTA_MARKETING_AGENTE =
  "Claro! Seu contato com o marketing é sobre parceria como influenciador(a) ou sobre outro assunto?";
export const PERGUNTA_PARCERIA_AGENTE =
  "Entendi que você quer saber sobre parceria com a MiMo. Você pensa em divulgar a marca ou tem outro formato em mente?";
export const OUTRO_ASSUNTO_AGENTE = "Outro assunto";
const distribuir = { id: "mimo_quero_distribuir", rotulo: "Quero distribuir" };

export function querDistribuirAgente(texto: string) {
  return texto.trim().replace(/[!.]+$/, "").toLowerCase() === distribuir.rotulo.toLowerCase();
}

const revenda = { id: "mimo_revenda", rotulo: "Quero revender" };
const outro = { id: "mimo_outro_assunto", rotulo: OUTRO_ASSUNTO_AGENTE };
const influencia = { id: "mimo_influencia", rotulo: "Sou influenciador(a)", resposta: "Quero parceria como influenciador" };
const menus: { pergunta: string; opcoes: { id: string; rotulo: string; resposta?: string }[] }[] = [
  { pergunta: PERGUNTA_ASSUNTO_AGENTE, opcoes: [
    revenda,
    distribuir,
    { id: "mimo_representacao", rotulo: "Ser representante", resposta: "Quero ser representante" },
    influencia,
    { id: "mimo_consumo", rotulo: "Consumo próprio" },
  ] },
  { pergunta: PERGUNTA_REVENDA_AGENTE, opcoes: [revenda, outro] },
  { pergunta: PERGUNTA_RAMO_AGENTE, opcoes: [
    { id: "mimo_mercado", rotulo: "Mercado" },
    { id: "mimo_emporio", rotulo: "Empório" },
    { id: "mimo_distribuicao", rotulo: "Distribuição" },
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

