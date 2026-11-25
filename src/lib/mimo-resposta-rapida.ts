// Keep the existing shared wording; personalize only from the selected CRM record.
export const RESPOSTA_RAPIDA_MIMO =
  "Posso te ajudar com o catálogo, as opções de produtos e as condições para o primeiro pedido.";

export function respostaRapidaMimo(contexto: {
  nomeContato?: string | null;
  nomeEmpresa?: string | null;
}) {
  const primeiroNome = contexto.nomeContato?.trim().split(/\s+/)[0];
  const nomeSeguro =
    primeiroNome && /^[\p{L}][\p{L}\p{M}'’.-]{0,39}$/u.test(primeiroNome) ? primeiroNome : null;
  const empresa = contexto.nomeEmpresa
    ?.replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const empresaSegura = empresa && empresa.length <= 200 ? empresa : null;
  const saudacao = nomeSeguro ? `Olá, ${nomeSeguro}!` : "Olá!";
  const corpo = empresaSegura
    ? `${RESPOSTA_RAPIDA_MIMO.slice(0, -1)} de ${empresaSegura}.`
    : RESPOSTA_RAPIDA_MIMO;
  const faltantes = [
    !nomeSeguro && "Nome do contato não informado ou inválido: usada saudação neutra.",
    !empresaSegura && "Empresa não informada: mantido o texto padrão.",
  ];
  return {
    texto: `${saudacao} ${corpo}`,
    aviso: [
      "Prévia editável deste contato. Revise antes de enviar.",
      ...faltantes.filter(Boolean),
    ].join(" "),
  };
}
