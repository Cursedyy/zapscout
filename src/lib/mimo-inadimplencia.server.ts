import { z } from "zod";
import type { ConfigOmie } from "./mimo-omie.server";
import {
  calcularInadimplencia,
  hojeSaoPaulo,
  normalizarTitulos,
  periodoInadimplenciaSchema,
  type PeriodoInadimplencia,
  type ResultadoInadimplencia,
} from "./mimo-inadimplencia";

/**
 * Leitura do Omie para os painéis de gestão (inadimplência e faturamento por representante
 * comercial). SOMENTE CONSULTA: as únicas chamadas permitidas estão em CHAMADAS_PERMITIDAS.
 * Nada é criado ou alterado no Omie.
 */
export const CHAMADAS_PERMITIDAS = {
  "financas/contareceber/": ["ListarContasReceber"],
  "geral/clientes/": ["ConsultarCliente", "ListarClientes"],
  "geral/vendedores/": ["ListarVendedores"],
  "produtos/nfconsultar/": ["ListarNF"],
} as const;
export type EndpointOmie = keyof typeof CHAMADAS_PERMITIDAS;
export type ChamadaOmie = (typeof CHAMADAS_PERMITIDAS)[EndpointOmie][number];

export const LIMITES_INADIMPLENCIA = {
  registrosPorPagina: 500,
  /** 20 páginas × 500 = até 10.000 títulos por consulta. */
  maxPaginas: 20,
  /** Pausa entre chamadas sequenciais para respeitar o limite de consumo do Omie. */
  pausaMs: 400,
  /** Nomes consultados para os primeiros clientes do ranking (uma chamada por cliente). */
  maxNomesClientes: 15,
  maxPaginasVendedores: 3,
  prazoMs: 25_000,
};

const BASE = "https://app.omie.com.br/api/v1/";
export const fetchOmie: typeof fetch = (...args) => globalThis.fetch(...args);
export const pausar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

export type DependenciasOmie = {
  fetcher?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  agora?: Date;
};

/** O Omie responde "Não existem registros" como falha; quem chama decide se é lista vazia. */
export class SemRegistros extends Error {}
export class LimiteOmieError extends Error {}

/** Única saída para o Omie nos painéis de leitura: recusa qualquer chamada fora da lista. */
export async function chamarOmie(
  cfg: ConfigOmie,
  endpoint: EndpointOmie,
  call: ChamadaOmie,
  param: object,
  fetcher: typeof fetch,
): Promise<unknown> {
  if (!(CHAMADAS_PERMITIDAS[endpoint] as readonly string[]).includes(call))
    throw Error("Chamada ao Omie não permitida neste painel.");
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), LIMITES_INADIMPLENCIA.prazoMs);
  let resposta: Response;
  try {
    resposta = await fetcher(`${BASE}${endpoint}`, {
      method: "POST",
      redirect: "manual",
      signal: controlador.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key: cfg.appKey, app_secret: cfg.secret, param: [param] }),
    });
  } catch {
    if (controlador.signal.aborted)
      throw Error("O Omie não respondeu a tempo (OMIE-TIMEOUT). Tente novamente em instantes.");
    console.error("[omie-leitura] Falha de rede", { call });
    throw Error("Não foi possível conectar ao Omie (OMIE-REDE). Tente novamente em instantes.");
  } finally {
    clearTimeout(prazo);
  }
  if (resposta.status >= 300 && resposta.status < 400)
    throw Error(`O Omie redirecionou a consulta (OMIE-REDIRECT-${resposta.status}).`);
  const bruto: unknown = await resposta.json().catch(() => undefined);
  const falha = z
    .object({ faultstring: z.string().optional(), faultcode: z.string().optional() })
    .safeParse(bruto);
  const texto = falha.success ? (falha.data.faultstring ?? "") : "";
  const temFalha = falha.success && Boolean(falha.data.faultcode || falha.data.faultstring);
  // Limite de consumo antes de credenciais: a mensagem de bloqueio por consumo cita "bloqueado".
  if (
    resposta.status === 429 ||
    /too many requests|consumo indevido|consumo redundante|limite de requisi/i.test(texto)
  )
    throw new LimiteOmieError(
      "O Omie limitou as consultas (consumo repetido ou excessivo). Aguarde alguns minutos e tente novamente.",
    );
  if (
    resposta.status === 401 ||
    resposta.status === 403 ||
    /app[_ -]?(key|secret)|credencia|n[aã]o autoriza|acesso negado|bloqueado|expirado|inativo/i.test(
      texto,
    )
  )
    throw Error(
      "O Omie recusou as credenciais configuradas. Solicite à administração a conferência do aplicativo Omie.",
    );
  if (/n[aã]o existem registros|nenhum registro encontrado/i.test(texto)) throw new SemRegistros();
  if (!resposta.ok || temFalha || bruto === undefined) {
    console.error("[omie-leitura] Consulta recusada", { call, status: resposta.status });
    throw Error(`O Omie recusou a consulta (${call}, HTTP ${resposta.status}).`);
  }
  return bruto;
}

const paginaSchema = z.object({
  pagina: z.number().int().optional(),
  total_de_paginas: z.number().int().nonnegative(),
  total_de_registros: z.number().int().nonnegative().optional(),
  conta_receber_cadastro: z.array(z.unknown()).nullish(),
});

/** Lê todas as páginas de ListarContasReceber, recusando bases acima do limite. */
export async function listarContasReceberOmie(cfg: ConfigOmie, deps: DependenciasOmie = {}) {
  const fetcher = deps.fetcher ?? fetchOmie;
  const esperar = deps.esperar ?? pausar;
  const registros: unknown[] = [];
  let totalPaginas = 1;
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    if (pagina > 1) await esperar(LIMITES_INADIMPLENCIA.pausaMs);
    let bruto: unknown;
    try {
      bruto = await chamarOmie(
        cfg,
        "financas/contareceber/",
        "ListarContasReceber",
        {
          pagina,
          registros_por_pagina: LIMITES_INADIMPLENCIA.registrosPorPagina,
          apenas_importado_api: "N",
        },
        fetcher,
      );
    } catch (erro) {
      if (erro instanceof SemRegistros && pagina === 1) return [];
      if (erro instanceof SemRegistros)
        throw Error("A lista de títulos mudou durante a leitura. Consulte novamente.");
      throw erro;
    }
    const envelope = paginaSchema.safeParse(bruto);
    if (!envelope.success)
      throw Error("O Omie retornou um formato inesperado na lista de contas a receber.");
    if (pagina === 1) {
      totalPaginas = envelope.data.total_de_paginas;
      if (totalPaginas > LIMITES_INADIMPLENCIA.maxPaginas) {
        const limite = LIMITES_INADIMPLENCIA.maxPaginas * LIMITES_INADIMPLENCIA.registrosPorPagina;
        throw Error(
          `O Omie tem ${envelope.data.total_de_registros ?? "mais de " + limite} títulos a receber, acima do limite de ${limite.toLocaleString("pt-BR")} desta consulta. Nenhum indicador foi calculado.`,
        );
      }
    } else if (envelope.data.total_de_paginas !== totalPaginas) {
      throw Error("A lista de títulos mudou durante a leitura. Consulte novamente.");
    }
    registros.push(...(envelope.data.conta_receber_cadastro ?? []));
  }
  return registros;
}

const clienteSchema = z.object({
  razao_social: z.string().nullish(),
  nome_fantasia: z.string().nullish(),
});
const vendedoresSchema = z.object({
  total_de_paginas: z.number().int().nonnegative(),
  cadastro: z
    .array(z.object({ codigo: z.number().int().positive(), nome: z.string().nullish() }))
    .nullish(),
});

/** Nomes de clientes e vendedores: complemento opcional, falhas não alteram valores. */
async function completarNomes(
  cfg: ConfigOmie,
  resultado: ResultadoInadimplencia,
  fetcher: typeof fetch,
  esperar: (ms: number) => Promise<void>,
) {
  let falhouCliente = false;
  for (const c of resultado.clientes.slice(0, LIMITES_INADIMPLENCIA.maxNomesClientes)) {
    await esperar(LIMITES_INADIMPLENCIA.pausaMs);
    try {
      const bruto = await chamarOmie(
        cfg,
        "geral/clientes/",
        "ConsultarCliente",
        { codigo_cliente_omie: c.cliente },
        fetcher,
      );
      const r = clienteSchema.safeParse(bruto);
      const nome = r.success ? (r.data.nome_fantasia || r.data.razao_social || "").trim() : "";
      c.nome = nome ? nome.slice(0, 120) : null;
    } catch (erro) {
      falhouCliente = true;
      if (erro instanceof LimiteOmieError) break;
    }
  }
  if (falhouCliente)
    resultado.avisos.push(
      "Alguns nomes de clientes não puderam ser consultados; eles aparecem pelo código Omie.",
    );

  if (!resultado.vendedores.some((v) => v.vendedor !== null)) return;
  const nomes = new Map<number, string>();
  try {
    for (let pagina = 1, total = 1; pagina <= total; pagina++) {
      await esperar(LIMITES_INADIMPLENCIA.pausaMs);
      const r = vendedoresSchema.safeParse(
        await chamarOmie(
          cfg,
          "geral/vendedores/",
          "ListarVendedores",
          { pagina, registros_por_pagina: 100, apenas_importado_api: "N" },
          fetcher,
        ),
      );
      if (!r.success) throw Error("formato");
      total = Math.min(r.data.total_de_paginas, LIMITES_INADIMPLENCIA.maxPaginasVendedores);
      for (const v of r.data.cadastro ?? []) if (v.nome?.trim()) nomes.set(v.codigo, v.nome.trim());
    }
  } catch {
    resultado.avisos.push(
      "Os nomes dos vendedores não puderam ser consultados; eles aparecem pelo código Omie.",
    );
  }
  for (const v of resultado.vendedores)
    if (v.vendedor !== null) v.nome = nomes.get(v.vendedor)?.slice(0, 120) ?? null;
}

export async function consultarInadimplenciaOmie(
  cfg: ConfigOmie,
  periodoBruto: PeriodoInadimplencia,
  deps: DependenciasOmie = {},
): Promise<ResultadoInadimplencia> {
  const periodo = periodoInadimplenciaSchema.parse(periodoBruto);
  const fetcher = deps.fetcher ?? fetchOmie;
  const esperar = deps.esperar ?? pausar;
  const agora = deps.agora ?? new Date();
  const registros = await listarContasReceberOmie(cfg, { fetcher, esperar });
  const { titulos, invalidos, duplicados } = normalizarTitulos(registros);
  if (registros.length && !titulos.length)
    throw Error(
      "O Omie retornou títulos sem os campos necessários (vencimento, valor, cliente ou status). Nenhum indicador foi calculado.",
    );
  const calculo = calcularInadimplencia(titulos, periodo, hojeSaoPaulo(agora));
  const avisos: string[] = [];
  if (invalidos)
    avisos.push(
      `${invalidos} título(s) sem campos obrigatórios válidos foram ignorados. Confira-os no Omie.`,
    );
  if (calculo.naoClassificados.quantidade)
    avisos.push(
      `${calculo.naoClassificados.quantidade} título(s) com status não reconhecido (${calculo.statusDesconhecidos.join(", ")}) ficaram fora dos indicadores.`,
    );
  const resultado: ResultadoInadimplencia = {
    ...calculo,
    geradoEm: agora.toISOString(),
    titulosLidos: registros.length,
    invalidos,
    duplicados,
    avisos,
  };
  await completarNomes(cfg, resultado, fetcher, esperar);
  return resultado;
}
