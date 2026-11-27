import { z } from "zod";
import { limitesPeriodo } from "./mimo-dashboard";
import { parseData } from "./mimo-meta-ads";
import type { DadosCodigosRetorno } from "./mimo-campanhas-codigos";

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
  campanha_id: string;
  conjunto_id: string;
  anuncio_id: string;
  campanha: string;
  conjunto: string;
  anuncio: string;
  data_inicio: string;
  data_fim: string;
  investimento: number | null;
  leads_meta: number | null;
};
export type LeadRetorno = {
  id: string;
  empresa_id: string;
  entrada_em: string;
  /** Ausente no esquema anterior à migração de códigos de campanha. */
  campanha_codigo_id?: string | null;
  campanha_codigo_origem?: string | null;
};
export type EventoRetorno = { id: string; empresa_id: string; lead_id: string | null; direcao: string; contato_em: string; referencia_anuncio: unknown };
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

function idAnuncioVerificado(referencia: unknown) {
  if (!referencia || typeof referencia !== 'object' || Array.isArray(referencia)) return null;
  const ref = referencia as Record<string, unknown>;
  return ref.fonte === 'metadado_whatsapp' && typeof ref.id === 'string' && /^\d{1,40}$/.test(ref.id) ? ref.id : null;
}
/** Names and UTMs are audit labels only. Attribution requires an exact authenticated Meta ad ID. */
export function calcularRetornoCampanhas(
  empresa: string,
  filtro: FiltroRetorno,
  meta: MetaRetorno[],
  leads: LeadRetorno[],
  pedidos: PedidoRetorno[] | null,
  eventos: EventoRetorno[] = [],
  dadosCodigos: DadosCodigosRetorno | null = null,
) {
  const { de, ate } = limitesPeriodo(filtro);
  const noPeriodo = (iso: string | null) =>
    !!iso && Date.parse(iso) >= Date.parse(de) && Date.parse(iso) <= Date.parse(ate);
  const leadsCoorte = unicos(leads, empresa).filter((l) => noPeriodo(l.entrada_em));
  const coorte = new Set(leadsCoorte.map((l) => l.id));
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
    const identidade = linha.campanha_id ? `id:${linha.campanha_id}` : `sem-id:${linha.campanha}`;
    const grupo = grupos.get(identidade) ?? [];
    grupo.push(linha);
    grupos.set(identidade, grupo);
  }
  const campanhas = [...grupos]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([identidade, linhas]) => {
      // Overlapping periods and aggregate/detail rows can double-count the same spend.
      // Refuse the campaign total instead of estimating how to split it.
      const sobreposto = temSobreposicao(linhas);
      const investimento = sobreposto ? null : valorConhecido(linhas, "investimento");
      const leadsMeta = sobreposto ? null : valorConhecido(linhas, "leads_meta");
      return {
        identidade,
        campanhaId: linhas[0].campanha_id || null,
        temChaveAtribuicao: linhas.some(linha => linha.campanha_id && linha.anuncio_id),
        campanha: linhas[0].campanha,
        investimento,
        leadsMeta,
        sobreposto,
        cplMeta:
          investimento !== null && leadsMeta !== null && leadsMeta > 0
            ? investimento / leadsMeta
            : null,
        leadsCrm: 0,
        pedidosFechados: pedidos === null ? null : 0,
        receitaAtribuida: pedidos === null ? null : 0,
        cac: null as number | null,
        roas: pedidos === null || investimento === null || investimento === 0 ? null : 0,
      };
    });
  const campanhasPorIdentidade = new Map(campanhas.map((c) => [c.identidade, c]));
  const campanhasPorAnuncio = new Map<string, Set<string>>();
  for (const linha of completas) {
    if (!linha.anuncio_id || !linha.campanha_id) continue;
    const ids = campanhasPorAnuncio.get(linha.anuncio_id) ?? new Set<string>();
    ids.add(`id:${linha.campanha_id}`); campanhasPorAnuncio.set(linha.anuncio_id, ids);
  }
  const candidatasPorLead = new Map<string, Set<string>>(), evidenciaAmbigua = new Set<string>();
  for (const evento of unicos(eventos, empresa)) {
    if (evento.direcao !== 'recebida' || !evento.lead_id || !coorte.has(evento.lead_id) || !noPeriodo(evento.contato_em)) continue;
    const anuncioId = idAnuncioVerificado(evento.referencia_anuncio); if (!anuncioId) continue;
    const identidades = campanhasPorAnuncio.get(anuncioId); if (!identidades) continue;
    if (identidades.size !== 1) { evidenciaAmbigua.add(evento.lead_id); continue; }
    const candidatas = candidatasPorLead.get(evento.lead_id) ?? new Set<string>();
    candidatas.add([...identidades][0]); candidatasPorLead.set(evento.lead_id, candidatas);
  }
  const atribuicao = new Map<string, string>(); let ambiguos = 0;
  for (const lead of leadsCoorte) {
    const candidatas = candidatasPorLead.get(lead.id);
    if (!evidenciaAmbigua.has(lead.id) && candidatas?.size === 1) atribuicao.set(lead.id, [...candidatas][0]);
    else if (evidenciaAmbigua.has(lead.id) || (candidatas && candidatas.size > 1)) ambiguos++;
  }
  for (const identidade of atribuicao.values()) campanhasPorIdentidade.get(identidade)!.leadsCrm++;
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
  if (daCoorte) {
    for (const pedido of daCoorte) {
      const identidade = atribuicao.get(pedido.lead_id); if (!identidade) continue;
      const campanha = campanhasPorIdentidade.get(identidade)!; campanha.pedidosFechados!++;
      if (['faturado', 'enviado', 'entregue'].includes(pedido.status)) campanha.receitaAtribuida! += pedido.total;
    }
    for (const campanha of campanhas) {
      campanha.cac = campanha.investimento !== null && campanha.pedidosFechados! > 0 ? Math.round(campanha.investimento / campanha.pedidosFechados!) : null;
      campanha.roas = campanha.investimento !== null && campanha.investimento > 0 ? campanha.receitaAtribuida! / campanha.investimento : null;
    }
  }
  const vendasNaoAtribuidas = daCoorte?.filter((p) => !atribuicao.has(p.lead_id)) ?? null;
  const porCodigo = dadosCodigos
    ? calcularPorCodigo(empresa, filtro, dadosCodigos, campanhas, leadsCoorte, daCoorte, receita)
    : null;
  return {
    porCodigo,
    campanhas: campanhas.map(c => c.temChaveAtribuicao ? c : {
      ...c, leadsCrm: null, pedidosFechados: null, receitaAtribuida: null, cac: null, roas: null,
    }),
    naoAtribuidos: {
      leads: coorte.size - atribuicao.size,
      pedidos: vendasNaoAtribuidas?.length ?? null,
      clientes: vendasNaoAtribuidas === null ? null : new Set(vendasNaoAtribuidas.map((p) => p.lead_id)).size,
      receitaFaturada: receita(vendasNaoAtribuidas),
      leadsAtribuidos: atribuicao.size,
      leadsAmbiguos: ambiguos,
      pedidosForaCoorte: foraCoorte?.length ?? null,
      receitaForaCoorte: receita(foraCoorte),
    },
    avisos: {
      parciais: recebidas.length - completas.length,
      semMeta: completas.length === 0,
      semVinculoCampanha: atribuicao.size === 0,
      pedidosDisponiveis: pedidos !== null,
    },
  };
}
export type RetornoCampanhas = ReturnType<typeof calcularRetornoCampanhas>;

type CampanhaMetaCalculada = { identidade: string; investimento: number | null; leadsMeta: number | null };

/**
 * Retorno por código de campanha. Só vínculos exatos: campanha_id Meta cadastrada no código,
 * lead.campanha_codigo_id e pedido.lead_id. Nomes, UTMs e textos do CRM nunca atribuem.
 */
function calcularPorCodigo(
  empresa: string,
  filtro: FiltroRetorno,
  dados: DadosCodigosRetorno,
  campanhasMeta: CampanhaMetaCalculada[],
  leadsCoorte: LeadRetorno[],
  vendasCoorte: PedidoRetorno[] | null,
  receita: (itens: PedidoRetorno[] | null) => number | null,
) {
  const codigos = unicos(dados.codigos, empresa).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const ids = new Set(codigos.map((c) => c.id));
  const codigoDaCampanha = new Map<string, string>();
  for (const v of dados.vinculos) {
    if (v.empresa_id !== empresa || !ids.has(v.codigo_id)) continue;
    const anterior = codigoDaCampanha.get(v.campanha_id);
    if (anterior && anterior !== v.codigo_id)
      throw Error("Campanha Meta vinculada a mais de um código. Revise o cadastro de códigos.");
    codigoDaCampanha.set(v.campanha_id, v.codigo_id);
  }
  const metaPorCampanha = new Map(campanhasMeta.map((c) => [c.identidade, c]));
  const manuais = unicos(dados.investimentos, empresa).filter(
    (i) =>
      ids.has(i.codigo_id) &&
      i.anulado_em === null &&
      i.competencia >= filtro.inicio &&
      i.competencia <= filtro.fim,
  );
  const codigoDoLead = new Map<string, string>();
  for (const lead of leadsCoorte)
    if (lead.campanha_codigo_id && ids.has(lead.campanha_codigo_id))
      codigoDoLead.set(lead.id, lead.campanha_codigo_id);

  // Sem IDs no esquema Meta não há como somar a campanha vinculada: indisponível, não zero.
  const somaMeta = (campanhas: string[], campo: "investimento" | "leadsMeta") => {
    if (campanhas.length && !dados.metaComIds) return null;
    let total = 0;
    for (const id of campanhas) {
      const linha = metaPorCampanha.get(`id:${id}`);
      if (!linha) continue; // nenhuma linha Meta integral desta campanha no período
      const valor = linha[campo];
      if (valor === null) return null;
      total = somar([total, valor]);
    }
    return total;
  };

  const itens = codigos.map((codigo) => {
    const campanhas = [...codigoDaCampanha]
      .filter(([, c]) => c === codigo.id)
      .map(([id]) => id)
      .sort();
    const investimentoMeta = somaMeta(campanhas, "investimento");
    const investimentoManual = somar(
      manuais
        .filter((i) => i.codigo_id === codigo.id)
        .map((i) => {
          if (!Number.isSafeInteger(i.valor_centavos) || i.valor_centavos < 0)
            throw Error("Investimento manual indisponível.");
          return i.valor_centavos;
        }),
    );
    const investimento =
      investimentoMeta === null ? null : somar([investimentoMeta, investimentoManual]);
    const leads = leadsCoorte.filter((l) => codigoDoLead.get(l.id) === codigo.id);
    const vendas = vendasCoorte?.filter((p) => codigoDoLead.get(p.lead_id) === codigo.id) ?? null;
    const pedidos = vendas?.length ?? null;
    const faturado = receita(vendas);
    return {
      id: codigo.id,
      codigo: codigo.codigo,
      nome: codigo.nome,
      ativo: codigo.ativo,
      campanhasMeta: campanhas,
      investimentoMeta,
      investimentoManual,
      investimento,
      leadsMeta: somaMeta(campanhas, "leadsMeta"),
      leadsCrm: leads.length,
      leadsAutomaticos: leads.filter((l) => l.campanha_codigo_origem === "anuncio_meta").length,
      cplCrm:
        investimento !== null && leads.length > 0 ? Math.round(investimento / leads.length) : null,
      pedidos,
      receita: faturado,
      cac:
        investimento !== null && pedidos !== null && pedidos > 0
          ? Math.round(investimento / pedidos)
          : null,
      roas:
        investimento !== null && investimento > 0 && faturado !== null
          ? faturado / investimento
          : null,
    };
  });

  const vinculadas = new Set([...codigoDaCampanha.keys()].map((id) => `id:${id}`));
  const metaLivre = campanhasMeta.filter((c) => !vinculadas.has(c.identidade));
  const vendasSemCodigo = vendasCoorte?.filter((p) => !codigoDoLead.has(p.lead_id)) ?? null;
  return {
    codigos: itens,
    semCodigo: {
      leads: leadsCoorte.length - codigoDoLead.size,
      pedidos: vendasSemCodigo?.length ?? null,
      receita: receita(vendasSemCodigo),
      investimentoMeta: metaLivre.some((c) => c.investimento === null)
        ? null
        : somar(metaLivre.map((c) => c.investimento!)),
    },
    metaComIds: dados.metaComIds,
  };
}
export type RetornoPorCodigo = NonNullable<RetornoCampanhas["porCodigo"]>;
