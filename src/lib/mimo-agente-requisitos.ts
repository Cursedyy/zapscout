import type { ConfigAgente, MensagemAgente } from "./mimo-agente";

const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const revender = /\brev(?:enda|ender(?:em)?|endedor(?:a|es|as)?)\b/;
const requisitos = /\b(?:requisitos?|quesitos?|criterios?|o que (?:eu )?preciso|o que (?:e )?necessario|como (?:eu )?(?:faco|comeco|posso)|como (?:ser|revender)|precis[ao] (?:de |ter )?(?:uma? )?(?:loja fisica|cnpj))\b/;
const loja = /\b(?:sem|(?:nao|n) (?:possuo|tenho)|precis[ao] (?:de |ter )?|(?:e )?(?:necessari[oa]|obrigatori[oa]) (?:ter )?)\s*(?:uma? )?(?:loja(?: fisica)?|cnpj|empresa aberta)\b/;
export const negaIntencaoRevenda = /\b(?:(?:nao|n) (?:tenho (?:mais )?interesse|(?:quero|queria|vou|pretendo|gostaria de|sou) (?:mais )?(?:ser (?:um |uma )?)?revend\w*)|sem interesse|sem revender)\b/;

export function pedidoParaRevender(textoNormalizado: string) {
  return !negaIntencaoRevenda.test(textoNormalizado) && revender.test(textoNormalizado) &&
    !/\b(?:meu amigo|minha amiga|minha mae|minha filha|ele|ela|alguem|terceiros?)\b/.test(textoNormalizado) &&
    (requisitos.test(textoNormalizado) || /\b(?:queria|quero|gostaria de|pretendo) (?:muito )?(?:comecar a |ser (?:um |uma )?)?revend\w*\b/.test(textoNormalizado));
}

function produtosDeclarados(texto: string, perguntaAnterior: string) {
  if (texto.length > 180 || !/\b(?:qual|quais|algum|que) produtos?\b/.test(perguntaAnterior) ||
    /[^ \p{L}\p{M},.!-]/u.test(texto) || /\b(?:nao|nem|sem|alergia|ingredientes?|precos?|quanto|contem|tem|voces|troca|exceto|menos)\b/.test(normal(texto))) return [];
  const itens = texto.trim().replace(/[.!]$/, "").split(/\s*,\s*|\s+e\s+/i)
    .map(item => item.replace(/^(?:as?|os?)\s+/i, "").trim());
  // A short list of product names is evidence of interest, never of availability or pricing.
  const produto = /^(?:barrinhas?|barras?|geleias?|misturinhas?|misturas?|panquecas?|bolos?|biscoitos?|temperos?|snacks?|granolas?)(?: magicas?| (?:de|para|com) [a-z]+(?: [a-z]+){0,2})?$/;
  return itens.length <= 6 && itens.every(item => produto.test(normal(item))) ? itens : [];
}

const semLoja = "Você pode começar a revender a MiMo mesmo sem loja física.";
const semCnpj = "Você pode começar a revender como pessoa física, sem CNPJ.";
const semRegra = "A equipe comercial pode confirmar os requisitos de revenda para o seu caso.";

function orientacaoRevisada(c: ConfigAgente, pergunta: string) {
  const base = normal(c.conhecimento);
  if (!c.conhecimentoRevisado) return semRegra;
  const frases = base.split(/[.!?\n]+/).map(s => s.trim());
  // Accept only affirmative statements about eligibility in the reviewed company policy.
  // Mixed rules, exceptions or unfamiliar wording go to the team for confirmation.
  const aceitaOnline = (s: string) => /^(?:(?:a mimo|a marca) )?(?:atende|aceita|atendemos|aceitamos)\b/.test(s) &&
    /\brevenda\b/.test(s) && /\b(?:negocios|lojas|vendas) online\b/.test(s) &&
    !/\b(?:nao|exceto|somente|apenas|exige|exigimos|necessari[oa]|obrigatori[oa]|desde que|mediante|precisa|com cnpj|se|mas|porem)\b/.test(s);
  const autorizaCnpj = /^(?:para revender(?: a mimo)?,? nao (?:e preciso|e necessario|precisa) (?:ter |de )?cnpj|a mimo aceita revenda sem cnpj)$/;
  const autorizaLoja = /^(?:para revender(?: a mimo)?,? nao (?:e preciso|e necessario|precisa) (?:ter |de )?(?:uma )?loja fisica|a mimo aceita revenda sem loja fisica)$/;
  const regras = frases.filter(s => /\b(?:lojas? fisicas?|negocios online|cnpj|empresa aberta)\b/.test(s));
  if (regras.some(s => !aceitaOnline(s) && !autorizaCnpj.test(s) && !autorizaLoja.test(s))) return semRegra;
  const pessoaFisica = regras.some(s => autorizaCnpj.test(s) || (aceitaOnline(s) && /\bsem exigir (?:empresa aberta ou )?cnpj\b/.test(s)));
  if (/\b(?:cnpj|empresa aberta)\b/.test(pergunta)) return pessoaFisica ? semCnpj : semRegra;
  const permiteSemLoja = regras.some(s => aceitaOnline(s) || autorizaLoja.test(s));
  return permiteSemLoja ? semLoja : semRegra;
}

export function requisitosDaConversa(c: ConfigAgente, mensagens: MensagemAgente[]) {
  let perguntaAnterior = "";
  let perguntaPendente = "";
  let respostaAnterior = "";
  let produtosAtuais: string[] = [];
  let perguntouAgora = false;
  const produtos = new Set<string>();
  for (const m of mensagens) {
    const t = normal(m.content);
    if (m.role === "assistant") {
      perguntaAnterior = t;
      produtosAtuais = [];
      perguntouAgora = false;
      if ([semLoja, semCnpj, semRegra].some(s => t.includes(normal(s)))) {
        respostaAnterior = t;
        perguntaPendente = "";
      }
      continue;
    }
    if ((revender.test(t) && requisitos.test(t)) || loja.test(t)) {
      perguntaPendente = t;
      perguntouAgora = true;
    }
    const citados = produtosDeclarados(m.content, perguntaAnterior);
    produtosAtuais.push(...citados);
    citados.forEach(p => produtos.add(p));
  }
  const orientacao = perguntaPendente ? orientacaoRevisada(c, perguntaPendente) : "";
  return {
    orientacao: orientacao && !respostaAnterior.includes(normal(orientacao)) ? orientacao : "",
    perguntouAgora,
    citadosAgora: [...new Set(produtosAtuais)],
    produtos: [...produtos],
    requisitos: !!(perguntaPendente || respostaAnterior),
  };
}
