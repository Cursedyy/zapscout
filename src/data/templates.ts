export type Template = {
  id: string;
  nome: string;
  nicho: string;
  mensagem: string;
  custom?: boolean;
};

export const TEMPLATES_PADRAO: Template[] = [
  {
    id: "t1",
    nome: "Abordagem para clínicas",
    nicho: "Saúde",
    mensagem: `Olá! Vi que a {{nome}} ainda não tem um site profissional. Sou da [SUA AGÊNCIA] e ajudo clínicas como a sua a atrair mais pacientes online. Posso te mostrar em 5 minutos como isso funciona?`,
  },
  {
    id: "t2",
    nome: "Negócio sem site",
    nicho: "Geral",
    mensagem: `Oi, tudo bem? Encontrei a {{nome}} no Google Maps e vi que vocês ainda não têm um site. Hoje em dia, 70% dos clientes pesquisam online antes de comprar. Posso ajudar com isso — você tem 5 minutos para eu te explicar?`,
  },
  {
    id: "t3",
    nome: "Melhorar presença digital",
    nicho: "Geral",
    mensagem: `Olá! Sou especialista em presença digital para negócios em {{cidade}}. Vi a {{nome}} no Google e acredito que posso ajudar a atrair muito mais clientes. Posso te apresentar algumas ideias?`,
  },
  {
    id: "t4",
    nome: "Restaurantes e delivery",
    nicho: "Alimentação",
    mensagem: `Oi! Vi o {{nome}} no Google Maps — que avaliações incríveis! Trabalho com marketing digital para restaurantes em {{cidade}} e tenho algumas ideias para aumentar seus pedidos online. Posso compartilhar?`,
  },
  {
    id: "t5",
    nome: "Nota baixa no Google",
    nicho: "Reputação",
    mensagem: `Olá! Sou especialista em reputação digital e vi que a {{nome}} tem oportunidade de melhorar sua presença no Google (atualmente {{avaliacao}}★). Com as estratégias certas, é possível aumentar sua nota e atrair muito mais clientes. Posso te explicar como?`,
  },
  {
    id: "t6",
    nome: "Pet shops e veterinárias",
    nicho: "Pet",
    mensagem: `Oi! Encontrei a {{nome}} no Google e adorei! Trabalho com marketing digital para pet shops e clínicas veterinárias em {{cidade}}. Tenho estratégias específicas para esse nicho. Você toparia uma conversa rápida?`,
  },
];

export function renderTemplate(
  tpl: string,
  vars: { nome: string; cidade: string; nicho: string; avaliacao: number },
) {
  return tpl
    .replaceAll("{{nome}}", vars.nome)
    .replaceAll("{{cidade}}", vars.cidade)
    .replaceAll("{{nicho}}", vars.nicho)
    .replaceAll("{{avaliacao}}", vars.avaliacao.toFixed(1));
}
