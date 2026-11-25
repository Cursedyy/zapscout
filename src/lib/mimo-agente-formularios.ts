/** Official influencer form already published at /influenciadores; exact text is also checked by the database. */
export const FORMULARIO_INFLUENCER_AGENTE =
  "Para parceria como influencer, preencha nosso formulário: https://zapscout.com.br/influenciadores";

/** Links approved by the owner. Never accept a model- or lead-supplied URL. */
export function formularioAgente(texto: string) {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const representante = /\b(?:representantes?|representacao|representar|represento|representamos)\b/.test(t);
  const influencer =
    /\b(?:influencer|influenciador[ae]?s?|influenciadora|criador(?:a)? de conteudo)\b/.test(t);
  if (representante === influencer) return null;
  if (
    /\b(?:nao (?:quero|sou|tenho interesse)|reclamacao|suporte|meu representante|minha representante|falar com|falar ao|telefone d[oa])\b/.test(
      t,
    )
  )
    return null;
  const interesse =
    /\b(?:quero|gostaria|sou|ser|cadastro|cadastrar|formulario|link|interesse|trabalho como|atuo como|represento|representamos)\b/.test(
      t,
    ) || /^(?:representante|representacao|influencer|influenciador|influenciadora)[!. ?]*$/.test(t);
  if (!interesse) return null;
  return representante
    ? "Para ser representante, preencha nosso formulário: https://zapscout.com.br/representantes"
    : FORMULARIO_INFLUENCER_AGENTE;
}
