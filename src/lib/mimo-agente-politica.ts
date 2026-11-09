import { z } from "zod";

const regraSchema = z.object({
  minimoCentavos: z.number().int().min(1).max(100_000_000),
  frete: z.enum(["CIF", "FOB"]),
});
export const politicaComercialAgenteSchema = z
  .object({
    revisada: z.boolean().default(false),
    regioes: z
      .array(
        regraSchema.extend({
          ufs: z
            .array(z.string().regex(/^[A-Z]{2}$/))
            .min(1)
            .max(27),
        }),
      )
      .max(27),
    demais: regraSchema,
    pix: z.boolean(),
    cartao: z
      .object({
        maxParcelas: z.number().int().min(1).max(12),
        juros: z.enum(["com_juros", "sem_juros", "consultar"]),
      })
      .nullable(),
    boleto: z.enum(["analise_credito", "consultar"]).nullable(),
    bonificacaoFrete: z.boolean(),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    for (const [i, r] of p.regioes.entries())
      for (const uf of r.ufs) {
        if (!(uf in estados) || seen.has(uf))
          ctx.addIssue({
            code: "custom",
            path: ["regioes", i, "ufs"],
            message: "Confira as UFs; cada estado deve aparecer em uma única região.",
          });
        seen.add(uf);
      }
  });
export type PoliticaComercialAgente = z.infer<typeof politicaComercialAgenteSchema>;
const estados: Record<string, string> = {
  AC: "acre",
  AL: "alagoas",
  AP: "amapa",
  AM: "amazonas",
  BA: "bahia",
  CE: "ceara",
  DF: "distrito federal",
  ES: "espirito santo",
  GO: "goias",
  MA: "maranhao",
  MT: "mato grosso",
  MS: "mato grosso do sul",
  MG: "minas gerais",
  PA: "para",
  PB: "paraiba",
  PR: "parana",
  PE: "pernambuco",
  PI: "piaui",
  RJ: "rio de janeiro",
  RN: "rio grande do norte",
  RS: "rio grande do sul",
  RO: "rondonia",
  RR: "roraima",
  SC: "santa catarina",
  SP: "sao paulo",
  SE: "sergipe",
  TO: "tocantins",
};
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const PERGUNTA_ESTADO_POLITICA =
  "Em qual estado você vai receber? Assim te passo o mínimo e o frete.";
type Mensagem = { role: "user" | "assistant"; content: string };
export function politicaRevisadaAgente(c: {
  conhecimentoRevisado: boolean;
  politicaComercial: PoliticaComercialAgente | null;
}) {
  return !!(c.conhecimentoRevisado && c.politicaComercial?.revisada);
}
export function temasPoliticaAgente(texto: string) {
  const t = normal(texto);
  const geral = /\b(condicoes comerciais|condicoes de compra|condicoes de revenda)\b/.test(t);
  return {
    minimo: geral || /\b(minimo|minima|primeiro pedido|pedido inicial)\b/.test(t),
    frete: geral || /\b(frete|cif|fob|bonificacoes|bonificacao)\b/.test(t),
    pagamento:
      geral ||
      /\b(pagamento|pagamentos|pagar|pix|cartao|cartoes|boleto|boletos|parcelamento|parcelar|parcelas|juros|taxa|taxas|vezes)\b/.test(
        t,
      ),
    bonificacao:
      /\b(frete).{0,35}(gratis|gratuito|desconto|abater)|\b(gratis|gratuito|desconto).{0,35}(frete)|\bbonifica(?:cao|coes)\b/.test(
        t,
      ),
  };
}
export function consultaPoliticaAgente(texto: string) {
  const p = temasPoliticaAgente(texto);
  return p.minimo || p.frete || p.pagamento;
}
export function negociacaoAgente(texto: string) {
  const t = normal(texto),
    temas = temasPoliticaAgente(texto);
  return (
    /\b(negociar|negociacao|baixar|reduzir|excecao|melhorar|fechar pedido|fechar negocio)\b/.test(
      t,
    ) ||
    (/\bdesconto\b/.test(t) && !temas.bonificacao) ||
    /\b(pedido|comprar).{0,30}\b(menor|menos|abaixo)\b|\b(menor|menos|abaixo).{0,30}\b(minimo|pedido)\b/.test(
      t,
    ) ||
    /\b(mudar|trocar|alterar).{0,30}\b(endereco|estado|entrega)\b/.test(t)
  );
}
// A state is taken only from explicit text/evidence; city, area code and partner name never imply it.
export function estadoExplicitoAgente(mensagens: Mensagem[]) {
  const textos = mensagens.filter((m) => m.role === "user").map((m) => m.content);
  for (const texto of [...textos].reverse()) {
    const t = normal(texto);
    const encontrados = Object.entries(estados)
      .filter(([uf, nome]) => {
        // "para" alone is a preposition; accept the state name with its accent or an explicit location prefix.
        const porNome =
          uf === "PA"
            ? /pará/i.test(texto) || /\b(?:estado do|sou do|moro no) para\b/.test(t)
            : new RegExp(`\\b${nome}\\b${uf === "MT" ? "(?! do sul)" : ""}`).test(t);
        const porSigla =
          new RegExp(`\\b${uf}\\b`).test(texto) ||
          t.trim() === uf.toLowerCase() ||
          new RegExp(
            `(?:estado (?:de|do)|sou (?:de|do)|moro (?:em|no)|entrega (?:em|no)|[-/,])\\s*${uf.toLowerCase()}\\b`,
          ).test(t);
        return porSigla || porNome;
      })
      .map(([uf]) => uf);
    if (!encontrados.length) continue;
    if (encontrados.length !== 1 || /\b(nao sou|nao moro|nao e|nao fica|talvez|se eu)\b/.test(t))
      return null;
    return encontrados[0];
  }
  return null;
}
export function respostaPoliticaAgente(
  c: {
    conhecimentoRevisado: boolean;
    politicaComercial: PoliticaComercialAgente | null;
    tamanho: number;
  },
  mensagens: Mensagem[],
) {
  if (!politicaRevisadaAgente(c)) return null;
  const p = c.politicaComercial!;
  let ultimoAssistant = -1;
  for (let i = mensagens.length - 1; i >= 0; i--)
    if (mensagens[i].role === "assistant") {
      ultimoAssistant = i;
      break;
    }
  const texto = mensagens
    .slice(ultimoAssistant + 1)
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  if (negociacaoAgente(texto)) return null;
  const temas = temasPoliticaAgente(texto);
  const uf = estadoExplicitoAgente(mensagens);
  if (mensagens[ultimoAssistant]?.content === PERGUNTA_ESTADO_POLITICA && uf) {
    temas.minimo = true;
    temas.frete = true;
  }
  if (!temas.minimo && !temas.frete && !temas.pagamento) return null;
  // Unit prices and custom quotes are never supplied by the policy responder.
  if (
    /\b(preco|precos|quanto custa|cotacao|orcamento|valor unitario|tabela de precos|margem|lucro|rentabilidade)\b/.test(
      normal(texto),
    )
  )
    return null;
  const blocos: string[] = [];
  if (temas.minimo || temas.frete) {
    if (p.regioes.length && !uf) blocos.push(PERGUNTA_ESTADO_POLITICA);
    else {
      const regra = p.regioes.find((r) => uf && r.ufs.includes(uf)) ?? p.demais;
      const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        regra.minimoCentavos / 100,
      );
      blocos.push(
        `${uf ? `Para ${uf}, o` : "O"} pedido mínimo é ${valor}. ${regra.frete === "CIF" ? "O frete já está incluído (CIF)." : "O frete fica por sua conta (FOB)."}`,
      );
      if (temas.bonificacao && regra.frete === "FOB" && p.bonificacaoFrete)
        blocos.push(
          "Podemos ajudar com uma bonificação no frete. A equipe confirma o valor com você, sem garantia de cobrir todo o custo.",
        );
    }
  }
  if (temas.pagamento) {
    const t = normal(texto),
      geral =
        /\b(pagamento|pagamentos|pagar|condicoes comerciais|condicoes de compra|condicoes de revenda)\b/.test(
          t,
        );
    if (
      (/\bpix\b/.test(t) && !p.pix) ||
      (/\b(cartao|cartoes)\b/.test(t) && !p.cartao) ||
      (/\bboleto(s)?\b/.test(t) && !p.boleto)
    )
      return null;
    if ((geral || /\bpix\b/.test(t)) && p.pix) blocos.push("Você pode pagar por Pix.");
    if (
      (geral || /\b(cartao|cartoes|parcelamento|parcelar|parcelas|juros|vezes)\b/.test(t)) &&
      p.cartao
    )
      blocos.push(
        `No cartão, dá para parcelar em até ${p.cartao.maxParcelas} vezes, ${p.cartao.juros === "com_juros" ? "com juros; a equipe confirma as taxas com você" : p.cartao.juros === "sem_juros" ? "sem juros" : "com as condições confirmadas pela equipe"}.`,
      );
    if ((geral || /\bboleto(s)?\b/.test(t)) && p.boleto)
      blocos.push(
        p.boleto === "analise_credito"
          ? "Também temos boleto a prazo, sujeito à análise de crédito."
          : "Se preferir boleto, a equipe confirma essa opção com você.",
      );
    if (/\b(taxa|taxas|valor da parcela|simulacao|simular)\b/.test(t)) return null;
    if (!blocos.length) return null;
  }
  // Keep conditions whole; truncating a sentence could hide credit or interest restrictions.
  const selecionados: string[] = [];
  for (const bloco of blocos)
    if ([...selecionados, bloco].join(" ").length <= c.tamanho) selecionados.push(bloco);
  return selecionados.length ? selecionados.join(" ") : null;
}
