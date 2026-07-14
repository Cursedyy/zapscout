export type Template = {
  id: string;
  nome: string;
  nicho: string;
  mensagem: string;
  custom?: boolean;
  /** Quando definido, este template é usado automaticamente no passo de follow-up correspondente (1, 2 ou 3). */
  followupStep?: 1 | 2 | 3;
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
  // ===== Cadência de follow-up automático =====
  {
    id: "fu1",
    nome: "Follow-up 1 — relembrar (D+1)",
    nicho: "Follow-up",
    followupStep: 1,
    mensagem: `Oi {{nome}}! Só passando para garantir que minha mensagem de ontem chegou 👋\n\nSe fizer sentido, te chamo rapidinho aqui — bastam 5 minutos para te mostrar como estamos ajudando outros negócios em {{cidade}} a captar mais clientes. Pode ser hoje ou amanhã?`,
  },
  {
    id: "fu2",
    nome: "Follow-up 2 — agregar valor (D+3)",
    nicho: "Follow-up",
    followupStep: 2,
    mensagem: `Oi {{nome}}, tudo certo? Imagino que a rotina aí na {{nome}} esteja corrida.\n\nPensei que talvez ajudasse: separei 2 ideias rápidas que estão funcionando bem para outros negócios de {{nicho}} em {{cidade}}. Posso te enviar aqui mesmo por WhatsApp em um áudio curtinho?`,
  },
  {
    id: "fu3",
    nome: "Follow-up 3 — fechamento educado (D+6)",
    nicho: "Follow-up",
    followupStep: 3,
    mensagem: `{{nome}}, não quero ser inconveniente — esta é minha última mensagem por aqui 🙏\n\nSe agora não é o momento ideal, sem problema! Caso queira retomar lá na frente, é só me chamar neste mesmo número. Sucesso aí na {{nome}}!`,
  },
];

/**
 * Variáveis aceitas dentro de templates (entre chaves duplas).
 * Tolerante a espaços e maiúsculas: {{ Nome }}, {{NOME}}, {{nome_empresa}} etc.
 */
export type TemplateVars = {
  nome: string;
  cidade: string;
  nicho: string;
  avaliacao: number;
  telefone?: string;
  endereco?: string;
};

/**
 * Monta o trecho da avaliação para uso no meio de frases dos templates.
 * Evita construções erradas como "está em sem avaliação" quando o lead
 * não possui nota no Google.
 */
export function montarTrechoAvaliacao(avaliacao: string | number | null | undefined): string {
  const raw = avaliacao == null ? "" : String(avaliacao);
  const semAvaliacao =
    !raw ||
    raw.trim() === "" ||
    raw.toLowerCase().includes("sem avaliação") ||
    raw.trim() === "—" ||
    raw.trim() === "-" ||
    raw.trim() === "0" ||
    raw.trim() === "0.0";

  if (!semAvaliacao) {
    return `A avaliação de vocês está em ${raw}, e isso já mostra que tem base para crescer ainda mais com ajustes em conversão, catálogo e checkout.`;
  }

  return `Vi que vocês ainda não têm avaliações no Google — isso é uma oportunidade e tanto pra já começar a construir prova social forte desde o início, junto com os ajustes de conversão, catálogo e checkout.`;
}

// chave normalizada (lower, sem espaços) → resolve para o valor final
function buildDicionario(vars: TemplateVars): Record<string, string> {
  const av = Number.isFinite(vars.avaliacao) && vars.avaliacao > 0
    ? vars.avaliacao.toFixed(1)
    : "sem avaliação";
  const nome = (vars.nome ?? "").trim() || "sua empresa";
  const cidade = (vars.cidade ?? "").trim() || "sua cidade";
  const nicho = (vars.nicho ?? "").trim() || "seu segmento";
  const telefone = (vars.telefone ?? "").trim();
  const endereco = (vars.endereco ?? "").trim();
  const trechoAvaliacao = montarTrechoAvaliacao(av);
  return {
    // canônicas
    nome, cidade, nicho, avaliacao: av, telefone, endereco,
    // trecho pronto e gramaticalmente correto para uso no meio de frases
    trecho_avaliacao: trechoAvaliacao,
    trechoavaliacao: trechoAvaliacao,
    // aliases comuns que aparecem em outras telas / inputs do usuário
    empresa: nome,
    nome_empresa: nome,
    nomeempresa: nome,
    negocio: nome,
    cliente: nome,
    segmento: nicho,
    categoria: nicho,
    setor: nicho,
    ramo: nicho,
    cidade_estado: cidade,
    local: cidade,
    nota: av,
    avaliacoes: av,
    rating: av,
    fone: telefone,
    whatsapp: telefone,
    endereço: endereco, // tolerância para acento
  };
}

const TOKEN_RE = /\{\{\s*([\wÀ-ÿ_]+)\s*\}\}/g;

import { renderSpintax } from "@/lib/spintax";

export function renderTemplate(tpl: string, vars: TemplateVars): string {
  const dict = buildDicionario(vars);
  // 1) Aplica spintax {a|b|c} ANTES das variáveis {{...}}.
  //    O regex de spintax [^{}]+ garante que {{var}} não seja consumido.
  const comSpin = renderSpintax(tpl);
  const out = comSpin.replace(TOKEN_RE, (full, raw: string) => {
    const key = raw.toLowerCase();
    const v = dict[key];
    return v != null ? v : full; // mantém placeholder se variável for desconhecida
  });
  // limpa espaços duplos resultantes de substituições vazias
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1");
}

/** Lista as variáveis ainda não substituídas no template renderizado. */
export function variaveisNaoResolvidas(textoRenderizado: string): string[] {
  const set = new Set<string>();
  for (const m of textoRenderizado.matchAll(TOKEN_RE)) set.add(m[1].toLowerCase());
  return [...set];
}

export function templateParaStep(templates: Template[], step: 1 | 2 | 3): Template | null {
  return templates.find((t) => t.followupStep === step) ?? null;
}
