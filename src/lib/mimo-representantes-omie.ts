import { z } from "zod";
import { dataOmieParaIso } from "./mimo-inadimplencia";
import {
  UFS_BR,
  calcularComissaoCentavos,
  calcularDesempenho,
  formatarBps,
  mapaManuais,
  principaisPorUf,
  type ClienteRepresentante,
  type LinhaDesempenho,
  type MotivoClienteSemRep,
  type PeriodoRepresentantes,
  type RepresentanteComercial,
  type TerritorioRepresentante,
  type UnidadeCarteiraRep,
} from "./mimo-representantes-comerciais";

/**
 * Faturamento por representante comercial a partir das notas fiscais de saída do Omie
 * (ListarNF). Módulo puro e seguro para o navegador: dinheiro em centavos inteiros.
 * Regras completas em docs/mimo-representantes-comerciais.md ("Faturamento pelo Omie").
 */

// ---------------------------------------------------------------- documentos e valores

/**
 * CNPJ/CPF só com dígitos. CNPJ com 12–13 dígitos (zeros à esquerda perdidos em planilhas)
 * é completado para 14. Qualquer outro tamanho é inválido ("").
 */
export function documentoNormalizado(valor: unknown) {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length === 11 || d.length === 14) return d;
  if (d.length === 12 || d.length === 13) return d.padStart(14, "0");
  return "";
}

/** Valor do Omie (reais, até 2 casas) para centavos inteiros; null se inválido. */
export function reaisOmieParaCentavos(valor: unknown): number | null {
  const n =
    typeof valor === "number"
      ? valor
      : typeof valor === "string" && /^\s*\d+(\.\d+)?\s*$/.test(valor)
        ? Number(valor)
        : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const c = Math.round(n * 100);
  return Number.isSafeInteger(c) ? c : null;
}

// ---------------------------------------------------------------- notas fiscais

const codigoSchema = z
  .union([z.number(), z.string().trim().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().positive().safe());
const textoOpcional = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined ? "" : String(v).trim()));

/** Campos lidos de cada `nfCadastro` (ListarNF com cApenasResumo = "S"). Extras são ignorados. */
export const notaOmieSchema = z.object({
  compl: z.object({ nIdNF: codigoSchema }),
  ide: z.object({
    nNF: textoOpcional,
    serie: textoOpcional,
    dEmi: z.string(),
    tpNF: textoOpcional,
    finNFe: textoOpcional,
    tpAmb: textoOpcional,
    dCan: textoOpcional,
    dInut: textoOpcional,
    cDeneg: textoOpcional,
  }),
  nfDestInt: z.object({ nCodCli: codigoSchema, cnpj_cpf: textoOpcional }),
  total: z.object({ ICMSTot: z.object({ vNF: z.union([z.number(), z.string()]) }) }),
});

export type NotaOmie = {
  id: number;
  numero: string;
  emissao: string;
  cliente: number;
  documento: string;
  valor: number;
};

export const MOTIVOS_EXCLUSAO = [
  "cancelada",
  "denegada",
  "inutilizada",
  "entrada",
  "devolucao",
  "complementar_ajuste",
  "homologacao",
  "fora_periodo",
] as const;
export type MotivoExclusaoNota = (typeof MOTIVOS_EXCLUSAO)[number];
export const ROTULO_EXCLUSAO: Record<MotivoExclusaoNota, string> = {
  cancelada: "Canceladas",
  denegada: "Denegadas",
  inutilizada: "Inutilizadas",
  entrada: "Notas de entrada",
  devolucao: "Devolução (finalidade 4)",
  complementar_ajuste: "Complementares ou de ajuste (finalidade 2 ou 3)",
  homologacao: "Ambiente de homologação",
  fora_periodo: "Emissão fora do período",
};

type Soma = { quantidade: number; valor: number };
const somaSegura = (a: number, b: number) => {
  const r = a + b;
  if (!Number.isSafeInteger(r)) throw Error("Total acima do limite seguro.");
  return r;
};

/**
 * Entram somente NF-e de saída (tpNF 1), finalidade normal (finNFe 1), em produção,
 * não canceladas, não denegadas, não inutilizadas e emitidas dentro do período.
 * Notas sem os campos obrigatórios são contadas como inválidas e nunca completadas.
 */
export function normalizarNotasOmie(registros: unknown[], periodo: PeriodoRepresentantes) {
  const notas = new Map<number, NotaOmie>();
  const excluidas = Object.fromEntries(
    MOTIVOS_EXCLUSAO.map((m) => [m, { quantidade: 0, valor: 0 }]),
  ) as Record<MotivoExclusaoNota, Soma>;
  let invalidas = 0;
  let duplicadas = 0;
  const vistas = new Set<number>();
  for (const registro of registros) {
    const r = notaOmieSchema.safeParse(registro);
    const emissao = r.success ? dataOmieParaIso(r.data.ide.dEmi) : null;
    const valor = r.success ? reaisOmieParaCentavos(r.data.total.ICMSTot.vNF) : null;
    if (!r.success || !emissao || valor === null) {
      invalidas++;
      continue;
    }
    const n = r.data;
    if (vistas.has(n.compl.nIdNF)) {
      duplicadas++;
      continue;
    }
    vistas.add(n.compl.nIdNF);
    let motivo: MotivoExclusaoNota | null = null;
    if (n.ide.dCan) motivo = "cancelada";
    else if (n.ide.cDeneg.toUpperCase() === "S") motivo = "denegada";
    else if (n.ide.dInut) motivo = "inutilizada";
    else if (n.ide.tpNF !== "1") motivo = "entrada";
    else if (n.ide.finNFe === "4") motivo = "devolucao";
    else if (n.ide.finNFe !== "1") motivo = "complementar_ajuste";
    else if (n.ide.tpAmb === "2") motivo = "homologacao";
    else if (emissao < periodo.de || emissao > periodo.ate) motivo = "fora_periodo";
    if (motivo) {
      excluidas[motivo].quantidade++;
      excluidas[motivo].valor = somaSegura(excluidas[motivo].valor, valor);
      continue;
    }
    notas.set(n.compl.nIdNF, {
      id: n.compl.nIdNF,
      numero: [n.ide.serie, n.ide.nNF].filter(Boolean).join("-"),
      emissao,
      cliente: n.nfDestInt.nCodCli,
      documento: documentoNormalizado(n.nfDestInt.cnpj_cpf),
      valor,
    });
  }
  return { notas: [...notas.values()], excluidas, invalidas, duplicadas };
}

// ---------------------------------------------------------------- clientes do Omie

/** Item de `clientes_cadastro` (ListarClientes) ou resposta de ConsultarCliente. */
export const clienteOmieSchema = z.object({
  codigo_cliente_omie: codigoSchema,
  cnpj_cpf: textoOpcional,
  estado: textoOpcional,
});
export type ClienteOmieRep = { codigo: number; uf: string | null; documento: string };

export function normalizarClienteOmie(bruto: unknown): ClienteOmieRep | null {
  const r = clienteOmieSchema.safeParse(bruto);
  if (!r.success) return null;
  const uf = r.data.estado.toUpperCase();
  return {
    codigo: r.data.codigo_cliente_omie,
    uf: UFS_BR.includes(uf) ? uf : null,
    documento: documentoNormalizado(r.data.cnpj_cpf),
  };
}

// ---------------------------------------------------------------- atribuição e desempenho

export type MotivoNotaSemRep =
  "cliente_nao_consultado" | "cliente_sem_uf" | "uf_sem_principal" | "atribuicoes_divergentes";
export const ROTULO_MOTIVO_NOTA: Record<MotivoNotaSemRep, string> = {
  cliente_nao_consultado: "Cliente do Omie não consultado (UF desconhecida)",
  cliente_sem_uf: "Cliente do Omie sem UF válida (vazia ou exterior)",
  uf_sem_principal: "UF do cliente sem representante principal ativo",
  atribuicoes_divergentes:
    "CNPJ/CPF ligado a unidades da carteira com atribuições manuais diferentes",
};

export type AtribuicaoOmie =
  | { representanteId: string; origem: "manual" | "uf" }
  | { representanteId: null; origem: null; motivo: MotivoNotaSemRep };

/** Unidade da carteira com atribuição manual e seu CNPJ/CPF cadastrado. */
export type UnidadeManualOmie = { unidade_id: string; cnpj: string };

/**
 * Representante manual por CNPJ/CPF normalizado: só unidades com atribuição manual
 * e documento válido. Um documento ligado a representantes diferentes fica marcado (null).
 */
export function manuaisPorDocumento(
  clientes: Pick<ClienteRepresentante, "unidade_id" | "representante_id">[],
  unidades: UnidadeManualOmie[],
) {
  const manuais = mapaManuais(clientes);
  const m = new Map<string, string | null>();
  for (const u of unidades) {
    const rep = manuais.get(u.unidade_id);
    const doc = documentoNormalizado(u.cnpj);
    if (!rep || !doc) continue;
    const atual = m.get(doc);
    m.set(doc, atual === undefined || atual === rep ? rep : null);
  }
  return m;
}

/**
 * Regra: (1) CNPJ/CPF da nota (ou do cadastro do cliente) igual ao de uma unidade da carteira
 * com atribuição manual → representante manual; (2) senão, principal ativo da UF do cadastro
 * do cliente no Omie; (3) senão, Sem representante com motivo.
 */
export function atribuirClienteOmie(
  documento: string,
  cliente: ClienteOmieRep | undefined,
  principais: Map<string, string>,
  manuaisDoc: Map<string, string | null>,
  representantesValidos: Set<string>,
): AtribuicaoOmie {
  for (const doc of [documento, cliente?.documento ?? ""]) {
    if (!doc || !manuaisDoc.has(doc)) continue;
    const rep = manuaisDoc.get(doc);
    if (rep === null)
      return { representanteId: null, origem: null, motivo: "atribuicoes_divergentes" };
    if (rep && representantesValidos.has(rep)) return { representanteId: rep, origem: "manual" };
  }
  if (!cliente) return { representanteId: null, origem: null, motivo: "cliente_nao_consultado" };
  if (!cliente.uf) return { representanteId: null, origem: null, motivo: "cliente_sem_uf" };
  const rep = principais.get(cliente.uf);
  return rep
    ? { representanteId: rep, origem: "uf" }
    : { representanteId: null, origem: null, motivo: "uf_sem_principal" };
}

export type SemRepresentanteOmie = {
  /** Unidades da carteira sem representante (mesma contagem da fonte "pedidos"). */
  clientes: number;
  motivosClientes: Record<MotivoClienteSemRep, number>;
  /** Clientes do Omie (códigos distintos) com notas no período e sem representante. */
  clientesFaturados: number;
  notas: number;
  faturamento: number;
  motivosNotas: Record<MotivoNotaSemRep, { notas: number; faturamento: number }>;
};
/** Linha por representante; `pedidos` aqui é a quantidade de notas fiscais. */
export type LinhaDesempenhoOmie = LinhaDesempenho;
export type DesempenhoOmie = {
  linhas: LinhaDesempenhoOmie[];
  semRepresentante: SemRepresentanteOmie;
  total: { clientes: number; notas: number; faturamento: number; comissao: number };
};

export function calcularDesempenhoOmie(input: {
  representantes: RepresentanteComercial[];
  territorios: TerritorioRepresentante[];
  clientes: Pick<ClienteRepresentante, "unidade_id" | "representante_id">[];
  unidades: Pick<UnidadeCarteiraRep, "id" | "uf">[];
  unidadesManuais: UnidadeManualOmie[];
  notas: NotaOmie[];
  clientesOmie: Map<number, ClienteOmieRep>;
}): DesempenhoOmie {
  // "Clientes na carteira" exatamente como hoje (unidades atribuídas, sem pedidos).
  const carteira = calcularDesempenho({ ...input, negociacoes: [], pedidos: [] });
  const linhas = new Map<string, LinhaDesempenhoOmie>(
    carteira.linhas.map((l) => [l.representanteId, { ...l }]),
  );
  const principais = principaisPorUf(input.representantes, input.territorios);
  const manuaisDoc = manuaisPorDocumento(input.clientes, input.unidadesManuais);
  const validos = new Set(linhas.keys());
  const sem: SemRepresentanteOmie = {
    clientes: carteira.semRepresentante.clientes,
    motivosClientes: carteira.semRepresentante.motivosClientes,
    clientesFaturados: 0,
    notas: 0,
    faturamento: 0,
    motivosNotas: {
      cliente_nao_consultado: { notas: 0, faturamento: 0 },
      cliente_sem_uf: { notas: 0, faturamento: 0 },
      uf_sem_principal: { notas: 0, faturamento: 0 },
      atribuicoes_divergentes: { notas: 0, faturamento: 0 },
    },
  };
  const faturados = new Map<string | null, Set<number>>();
  const vistas = new Set<number>();
  for (const n of input.notas) {
    if (vistas.has(n.id)) continue;
    if (!Number.isSafeInteger(n.valor) || n.valor < 0) throw Error("Valor de nota inválido.");
    vistas.add(n.id);
    const a = atribuirClienteOmie(
      n.documento,
      input.clientesOmie.get(n.cliente),
      principais,
      manuaisDoc,
      validos,
    );
    const destino = a.representanteId ? linhas.get(a.representanteId)! : null;
    if (destino) {
      destino.pedidos++;
      destino.faturamento = somaSegura(destino.faturamento, n.valor);
    } else {
      const motivo = a.representanteId === null ? a.motivo : "uf_sem_principal";
      sem.notas++;
      sem.faturamento = somaSegura(sem.faturamento, n.valor);
      sem.motivosNotas[motivo].notas++;
      sem.motivosNotas[motivo].faturamento = somaSegura(
        sem.motivosNotas[motivo].faturamento,
        n.valor,
      );
    }
    const chave = destino?.representanteId ?? null;
    const s = faturados.get(chave) ?? new Set<number>();
    s.add(n.cliente);
    faturados.set(chave, s);
  }
  const total = {
    clientes: sem.clientes,
    notas: sem.notas,
    faturamento: sem.faturamento,
    comissao: 0,
  };
  for (const l of linhas.values()) {
    l.clientesFaturados = faturados.get(l.representanteId)?.size ?? 0;
    // Comissão uma vez sobre o total do período (BigInt, meio centavo para cima).
    l.comissao = calcularComissaoCentavos(l.faturamento, l.comissaoBps);
    total.clientes += l.clientes;
    total.notas += l.pedidos;
    total.faturamento = somaSegura(total.faturamento, l.faturamento);
    total.comissao = somaSegura(total.comissao, l.comissao);
  }
  sem.clientesFaturados = faturados.get(null)?.size ?? 0;
  return { linhas: [...linhas.values()], semRepresentante: sem, total };
}

export type ResultadoFaturamentoOmie = DesempenhoOmie & {
  periodo: PeriodoRepresentantes;
  geradoEm: string;
  notasLidas: number;
  notasConsideradas: number;
  invalidas: number;
  duplicadas: number;
  excluidas: Record<MotivoExclusaoNota, Soma>;
  clientesOmie: { consultados: number; naoConsultados: number };
  avisos: string[];
};

export type RespostaFaturamentoOmie =
  | { disponivel: false; mensagem: string }
  | { disponivel: true; resultado: ResultadoFaturamentoOmie };

// ---------------------------------------------------------------- CSV

const celula = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[\s]*([=+@-])/, "'$1")
    .replace(/"/g, '""') +
  '"';
const decimal = (centavos: number) => {
  const s = String(centavos).padStart(3, "0");
  return `${s.slice(0, -2)},${s.slice(-2)}`;
};

/** CSV com ";" e proteção contra fórmulas (mesma regra da exportação por pedidos). */
export function csvDesempenhoOmie(r: ResultadoFaturamentoOmie) {
  const cab = [
    "Período",
    "Fonte",
    "Representante",
    "Situação",
    "UFs principais",
    "UFs secundárias",
    "Comissão %",
    "Clientes na carteira",
    "Clientes atribuídos manualmente",
    "Clientes Omie faturados no período",
    "Notas fiscais",
    "Faturamento (R$)",
    "Comissão (R$)",
  ];
  const per = `${r.periodo.de} a ${r.periodo.ate}`;
  const fonte = "Omie (NF-e de saída)";
  const linhas = r.linhas.map((l) => [
    per,
    fonte,
    l.nome,
    l.ativo ? "Ativo" : "Inativo",
    l.ufsPrincipais.join(", "),
    l.ufsSecundarias.join(", "),
    formatarBps(l.comissaoBps),
    l.clientes,
    l.clientesManuais,
    l.clientesFaturados,
    l.pedidos,
    decimal(l.faturamento),
    decimal(l.comissao),
  ]);
  const s = r.semRepresentante;
  linhas.push([
    per,
    fonte,
    "Sem representante",
    "",
    "",
    "",
    "",
    s.clientes,
    "",
    s.clientesFaturados,
    s.notas,
    decimal(s.faturamento),
    "",
  ]);
  linhas.push([
    per,
    fonte,
    "Total",
    "",
    "",
    "",
    "",
    r.total.clientes,
    "",
    "",
    r.total.notas,
    decimal(r.total.faturamento),
    decimal(r.total.comissao),
  ]);
  return "﻿" + [cab, ...linhas].map((row) => row.map(celula).join(";")).join("\r\n");
}
