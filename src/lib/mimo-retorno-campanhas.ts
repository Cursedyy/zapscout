import { z } from "zod";
import { limitesPeriodo } from "./mimo-dashboard";
import { parseData } from "./mimo-meta-ads";

const dataSchema = z.string().refine((v) => parseData(v) === v, "Informe uma data válida.");
export const filtroRetornoSchema = z
  .object({ inicio: dataSchema, fim: dataSchema })
  .strict()
  .refine(
    (v) => v.inicio <= v.fim && (Date.parse(v.fim) - Date.parse(v.inicio)) / 86400000 <= 366,
    "Escolha um período de até um ano.",
  );
export type FiltroRetorno = z.infer<typeof filtroRetornoSchema>;
export type MetaRetorno = {
  id: string;
  empresa_id: string;
  chave: string;
  campanha: string;
  conjunto: string;
  anuncio: string;
  data_inicio: string;
  data_fim: string;
  investimento: number | null;
  leads_meta: number | null;
};
export type LeadRetorno = { id: string; empresa_id: string; entrada_em: string };
export type PedidoRetorno = {
  id: string;
  empresa_id: string;
  lead_id: string;
  status: string;
  total: number;
  primeira_confirmacao: string | null;
};

function unicos<T extends { id: string; empresa_id: string }>(linhas: T[], empresa: string) {
  const mapa = new Map<string, T>();
  for (const linha of linhas) {
    if (linha.empresa_id !== empresa) continue;
    const anterior = mapa.get(linha.id);
    if (anterior && JSON.stringify(anterior) !== JSON.stringify(linha))
      throw Error("Os registros mudaram durante a consulta. Atualize os indicadores.");
    mapa.set(linha.id, linha);
  }
  return [...mapa.values()];
}
function centavos(valor: number) {
  const resultado = Math.round(valor * 100);
  if (!Number.isFinite(valor) || valor < 0 || !Number.isSafeInteger(resultado))
    throw Error("Valor monetário indisponível.");
  return resultado;
}
function somar(valores: number[]) {
  const total = valores.reduce((s, v) => s + v, 0);
  if (!Number.isSafeInteger(total)) throw Error("Total indisponível. Reduza o período.");
  return total;
}
const valorConhecido = (linhas: MetaRetorno[], campo: "investimento" | "leads_meta") => {
  if (!linhas.length || linhas.some((l) => l[campo] === null)) return null;
  if (
    campo === "leads_meta" &&
    linhas.some((l) => !Number.isSafeInteger(l.leads_meta) || l.leads_meta! < 0)
  )
    throw Error("Contagem Meta indisponível.");
  return somar(linhas.map((l) => (campo === "investimento" ? centavos(l[campo]!) : l[campo]!)));
};
function temSobreposicao(linhas: MetaRetorno[]) {
  const graos = new Map<string, MetaRetorno[]>();
  for (const linha of linhas) {
    const chave = JSON.stringify([linha.conjunto, linha.anuncio]);
    const grupo = graos.get(chave) ?? [];
    grupo.push(linha);
    graos.set(chave, grupo);
  }
  for (const grupo of graos.values()) {
    grupo.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
    for (let n = 1; n < grupo.length; n++)
      if (grupo[n].data_inicio <= grupo[n - 1].data_fim) return true;
  }
  return linhas
    .filter((l) => !l.conjunto || !l.anuncio)
    .some((a) =>
      linhas.some(
        (b) =>
          a.id !== b.id &&
          a.data_inicio <= b.data_fim &&
          b.data_inicio <= a.data_fim &&
          (!a.conjunto || !b.conjunto || a.conjunto === b.conjunto) &&
          (!a.anuncio || !b.anuncio || a.anuncio === b.anuncio),
      ),
    );
}

/** No stable campaign/ad ID links the imported Meta names to the CRM today.
 * Names are display/filter labels only, NEVER a revenue attribution key.
 * Order IDs deduplicate sales, and lead_id is the only proven CRM relationship.
 */
export function calcularRetornoCampanhas(
  empresa: string,
  filtro: FiltroRetorno,
  meta: MetaRetorno[],
  leads: LeadRetorno[],
  pedidos: PedidoRetorno[] | null,
) {
  const { de, ate } = limitesPeriodo(filtro);
  const noPeriodo = (iso: string | null) =>
    !!iso && Date.parse(iso) >= Date.parse(de) && Date.parse(iso) <= Date.parse(ate);
  const coorte = new Set(
    unicos(leads, empresa)
      .filter((l) => noPeriodo(l.entrada_em))
      .map((l) => l.id),
  );
  const recebidas = unicos(meta, empresa).filter(
    (m) => m.data_inicio <= filtro.fim && m.data_fim >= filtro.inicio,
  );
  const completas = recebidas.filter(
    (m) => m.data_inicio >= filtro.inicio && m.data_fim <= filtro.fim,
  );
  // A key is unique in the canonical import. Refuse conflicting snapshots.
  const chaves = new Set<string>();
  for (const linha of completas) {
    if (chaves.has(linha.chave))
      throw Error("Métricas duplicadas. Confira a importação antes de calcular.");
    chaves.add(linha.chave);
  }
  const grupos = new Map<string, MetaRetorno[]>();
  for (const linha of completas) {
    const grupo = grupos.get(linha.campanha) ?? [];
    grupo.push(linha);
    grupos.set(linha.campanha, grupo);
  }
  const campanhas = [...grupos]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([campanha, linhas]) => {
      // Overlapping periods and aggregate/detail rows can double-count the same spend.
      // Refuse the campaign total instead of estimating how to split it.
      const sobreposto = temSobreposicao(linhas);
      const investimento = sobreposto ? null : valorConhecido(linhas, "investimento");
      const leadsMeta = sobreposto ? null : valorConhecido(linhas, "leads_meta");
      return {
        campanha,
        investimento,
        leadsMeta,
        sobreposto,
        cplMeta:
          investimento !== null && leadsMeta !== null && leadsMeta > 0
            ? investimento / leadsMeta
            : null,
        leadsCrm: null,
        pedidosFechados: null,
        receitaAtribuida: null,
        cac: null,
        roas: null,
      };
    });
  const vendas =
    pedidos === null
      ? null
      : unicos(pedidos, empresa).filter(
          (p) =>
            ["confirmado", "faturado", "enviado", "entregue"].includes(p.status) &&
            noPeriodo(p.primeira_confirmacao),
        );
  const daCoorte = vendas?.filter((p) => coorte.has(p.lead_id)) ?? null;
  const foraCoorte = vendas?.filter((p) => !coorte.has(p.lead_id)) ?? null;
  const receita = (itens: PedidoRetorno[] | null) =>
    itens === null
      ? null
      : somar(
          itens
            .filter((p) => ["faturado", "enviado", "entregue"].includes(p.status))
            .map((p) => {
              if (!Number.isSafeInteger(p.total) || p.total < 0)
                throw Error("Valor de pedido indisponível.");
              return p.total; // Canonical order totals already use cents.
            }),
        );
  return {
    campanhas,
    naoAtribuidos: {
      leads: coorte.size,
      pedidos: daCoorte?.length ?? null,
      clientes: daCoorte === null ? null : new Set(daCoorte.map((p) => p.lead_id)).size,
      receitaFaturada: receita(daCoorte),
      pedidosForaCoorte: foraCoorte?.length ?? null,
      receitaForaCoorte: receita(foraCoorte),
    },
    avisos: {
      parciais: recebidas.length - completas.length,
      semMeta: completas.length === 0,
      semVinculoCampanha: true as const,
      pedidosDisponiveis: pedidos !== null,
    },
  };
}
export type RetornoCampanhas = ReturnType<typeof calcularRetornoCampanhas>;
