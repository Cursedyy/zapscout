import { z } from "zod";
import type { ConfigOmie } from "./mimo-omie.server";
import {
  LimiteOmieError,
  SemRegistros,
  chamarOmie,
  fetchOmie,
  pausar,
} from "./mimo-inadimplencia.server";
import {
  periodoRepresentantesSchema,
  type ClienteRepresentante,
  type PeriodoRepresentantes,
  type RepresentanteComercial,
  type TerritorioRepresentante,
  type UnidadeCarteiraRep,
} from "./mimo-representantes-comerciais";
import {
  calcularDesempenhoOmie,
  manuaisPorDocumento,
  normalizarClienteOmie,
  normalizarNotasOmie,
  type ClienteOmieRep,
  type ResultadoFaturamentoOmie,
  type UnidadeManualOmie,
} from "./mimo-representantes-omie";

/**
 * Faturamento por representante lido do Omie. SOMENTE CONSULTA: usa a mesma porta
 * `chamarOmie` (lista de chamadas permitidas) do painel de inadimplência.
 * Chamadas: produtos/nfconsultar ListarNF, geral/clientes ListarClientes e ConsultarCliente.
 */
export const LIMITES_FATURAMENTO_OMIE = {
  /** Máximo aceito pelo ListarNF. */
  notasPorPagina: 100,
  /** 50 páginas × 100 = até 5.000 notas por consulta. */
  maxPaginasNotas: 50,
  /** Códigos por chamada de ListarClientes (clientesPorCodigo). */
  clientesPorLote: 50,
  /** Consultas individuais (ConsultarCliente) para clientes que o lote não devolveu. */
  maxConsultasIndividuais: 100,
  /** Pausa entre chamadas sequenciais para respeitar o limite de consumo do Omie. */
  pausaMs: 400,
  /** Tempo total da consulta; acima disso a consulta é interrompida sem valores. */
  prazoTotalMs: 110_000,
};

export type DependenciasFaturamentoOmie = {
  fetcher?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: Date;
  /** Relógio em ms (testes). */
  relogio?: () => number;
};

type Contexto = {
  cfg: ConfigOmie;
  fetcher: typeof fetch;
  esperar: (ms: number) => Promise<void>;
  relogio: () => number;
  inicio: number;
  chamadas: number;
};

const MENSAGEM_PRAZO =
  "A consulta ao Omie passou do tempo limite. Reduza o período e tente novamente. Nenhum valor foi calculado.";

/** Pausa entre chamadas e confere o prazo total antes de cada nova chamada. */
async function antesDaChamada(ctx: Contexto) {
  if (ctx.chamadas > 0) await ctx.esperar(LIMITES_FATURAMENTO_OMIE.pausaMs);
  if (ctx.relogio() - ctx.inicio > LIMITES_FATURAMENTO_OMIE.prazoTotalMs)
    throw Error(MENSAGEM_PRAZO);
  ctx.chamadas++;
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

const paginaNotasSchema = z.object({
  pagina: z.number().int().optional(),
  total_de_paginas: z.number().int().nonnegative(),
  total_de_registros: z.number().int().nonnegative().optional(),
  nfCadastro: z.array(z.unknown()).nullish(),
});

/**
 * NF-e de saída não canceladas emitidas no período (ListarNF, resumo sem itens).
 * Recusa períodos acima do limite em vez de calcular com dados parciais.
 */
async function listarNotas(ctx: Contexto, periodo: PeriodoRepresentantes) {
  const registros: unknown[] = [];
  let totalPaginas = 1;
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    await antesDaChamada(ctx);
    let bruto: unknown;
    try {
      bruto = await chamarOmie(
        ctx.cfg,
        "produtos/nfconsultar/",
        "ListarNF",
        {
          pagina,
          registros_por_pagina: LIMITES_FATURAMENTO_OMIE.notasPorPagina,
          apenas_importado_api: "N",
          dEmiInicial: dataBr(periodo.de),
          dEmiFinal: dataBr(periodo.ate),
          tpNF: "1",
          filtrar_por_status: "N",
          cApenasResumo: "S",
        },
        ctx.fetcher,
      );
    } catch (erro) {
      if (erro instanceof SemRegistros && pagina === 1) return [];
      if (erro instanceof SemRegistros)
        throw Error("A lista de notas fiscais mudou durante a leitura. Consulte novamente.");
      throw erro;
    }
    const envelope = paginaNotasSchema.safeParse(bruto);
    if (!envelope.success)
      throw Error("O Omie retornou um formato inesperado na lista de notas fiscais.");
    if (pagina === 1) {
      totalPaginas = envelope.data.total_de_paginas;
      if (totalPaginas > LIMITES_FATURAMENTO_OMIE.maxPaginasNotas) {
        const limite =
          LIMITES_FATURAMENTO_OMIE.maxPaginasNotas * LIMITES_FATURAMENTO_OMIE.notasPorPagina;
        const total = envelope.data.total_de_registros;
        throw Error(
          `O Omie tem ${total !== undefined ? total.toLocaleString("pt-BR") : "mais de " + limite.toLocaleString("pt-BR")} notas fiscais de saída no período, acima do limite de ${limite.toLocaleString("pt-BR")} desta consulta. Reduza o período. Nenhum valor foi calculado.`,
        );
      }
    } else if (envelope.data.total_de_paginas !== totalPaginas) {
      throw Error("A lista de notas fiscais mudou durante a leitura. Consulte novamente.");
    }
    registros.push(...(envelope.data.nfCadastro ?? []));
  }
  return registros;
}

const listaClientesSchema = z.object({
  clientes_cadastro: z.array(z.unknown()).nullish(),
});

/**
 * UF e CNPJ/CPF dos clientes (cache por consulta). Primeiro em lotes (ListarClientes com
 * clientesPorCodigo); quem o lote não devolver é consultado um a um (ConsultarCliente),
 * até o limite. Falha aqui nunca inventa UF: o cliente fica "não consultado".
 */
async function consultarClientes(ctx: Contexto, codigos: number[]) {
  const mapa = new Map<number, ClienteOmieRep>();
  const pedidos = new Set(codigos);
  let limitado = false;
  const guardar = (bruto: unknown) => {
    const c = normalizarClienteOmie(bruto);
    if (c && pedidos.has(c.codigo) && !mapa.has(c.codigo)) mapa.set(c.codigo, c);
  };
  for (let i = 0; i < codigos.length && !limitado; i += LIMITES_FATURAMENTO_OMIE.clientesPorLote) {
    const lote = codigos.slice(i, i + LIMITES_FATURAMENTO_OMIE.clientesPorLote);
    await antesDaChamada(ctx);
    try {
      const bruto = await chamarOmie(
        ctx.cfg,
        "geral/clientes/",
        "ListarClientes",
        {
          pagina: 1,
          registros_por_pagina: 100,
          apenas_importado_api: "N",
          clientesPorCodigo: lote.map((codigo_cliente_omie) => ({ codigo_cliente_omie })),
        },
        ctx.fetcher,
      );
      const r = listaClientesSchema.safeParse(bruto);
      if (r.success) for (const c of r.data.clientes_cadastro ?? []) guardar(c);
    } catch (erro) {
      if (erro instanceof LimiteOmieError) limitado = true;
      else if (!(erro instanceof SemRegistros))
        console.error("[omie-representantes] Lote de clientes recusado; consulta individual");
    }
  }
  let individuais = 0;
  for (const codigo of codigos) {
    if (limitado || individuais >= LIMITES_FATURAMENTO_OMIE.maxConsultasIndividuais) break;
    if (mapa.has(codigo)) continue;
    individuais++;
    await antesDaChamada(ctx);
    try {
      guardar(
        await chamarOmie(
          ctx.cfg,
          "geral/clientes/",
          "ConsultarCliente",
          { codigo_cliente_omie: codigo },
          ctx.fetcher,
        ),
      );
    } catch (erro) {
      if (erro instanceof LimiteOmieError) limitado = true;
    }
  }
  return { mapa, naoConsultados: codigos.filter((c) => !mapa.has(c)).length, limitado };
}

export type BaseFaturamentoOmie = {
  representantes: RepresentanteComercial[];
  territorios: TerritorioRepresentante[];
  clientes: Pick<ClienteRepresentante, "unidade_id" | "representante_id">[];
  unidades: Pick<UnidadeCarteiraRep, "id" | "uf">[];
  unidadesManuais: UnidadeManualOmie[];
};

export async function consultarFaturamentoOmie(
  cfg: ConfigOmie,
  periodoBruto: PeriodoRepresentantes,
  base: BaseFaturamentoOmie,
  deps: DependenciasFaturamentoOmie = {},
): Promise<ResultadoFaturamentoOmie> {
  const periodo = periodoRepresentantesSchema.parse(periodoBruto);
  const relogio = deps.relogio ?? Date.now;
  const ctx: Contexto = {
    cfg,
    fetcher: deps.fetcher ?? fetchOmie,
    esperar: deps.esperar ?? pausar,
    relogio,
    inicio: relogio(),
    chamadas: 0,
  };
  const agora = deps.agora ?? new Date();
  const registros = await listarNotas(ctx, periodo);
  const { notas, excluidas, invalidas, duplicadas } = normalizarNotasOmie(registros, periodo);
  if (registros.length && invalidas === registros.length)
    throw Error(
      "O Omie retornou notas fiscais sem os campos necessários (emissão, valor ou cliente). Nenhum valor foi calculado.",
    );
  // Clientes cujo CNPJ/CPF da nota já casa com uma atribuição manual não precisam de UF.
  const manuaisDoc = manuaisPorDocumento(base.clientes, base.unidadesManuais);
  const codigos = [
    ...new Set(notas.filter((n) => !manuaisDoc.has(n.documento)).map((n) => n.cliente)),
  ].sort((a, b) => a - b);
  const clientes = await consultarClientes(ctx, codigos);
  const desempenho = calcularDesempenhoOmie({ ...base, notas, clientesOmie: clientes.mapa });
  const avisos: string[] = [];
  if (invalidas)
    avisos.push(
      `${invalidas} nota(s) sem campos obrigatórios válidos foram ignoradas. Confira-as no Omie.`,
    );
  if (clientes.naoConsultados)
    avisos.push(
      `${clientes.naoConsultados} cliente(s) do Omie não puderam ser consultados${clientes.limitado ? " (limite de consumo do Omie)" : ""}; as notas deles aparecem em Sem representante. Consulte novamente mais tarde.`,
    );
  return {
    ...desempenho,
    periodo,
    geradoEm: agora.toISOString(),
    notasLidas: registros.length,
    notasConsideradas: notas.length,
    invalidas,
    duplicadas,
    excluidas,
    clientesOmie: { consultados: clientes.mapa.size, naoConsultados: clientes.naoConsultados },
    avisos,
  };
}
