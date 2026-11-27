import { z } from "zod";
import { diaComercial } from "./mimo-comercial";
import { celulaCsv } from "./mimo-relatorio";

/**
 * Inadimplência MiMo a partir de "Contas a Receber" do Omie (somente leitura).
 * Módulo puro e seguro para o navegador: valores sempre em centavos inteiros.
 * Definições completas em docs/mimo-inadimplencia.md.
 */

export const MAX_DIAS_PERIODO = 366;
const DIA_MS = 86_400_000;
const dataIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato AAAA-MM-DD.")
  .refine((v) => {
    const t = Date.parse(`${v}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
  }, "Data inválida.");

export const periodoInadimplenciaSchema = z
  .object({ de: dataIsoSchema, ate: dataIsoSchema })
  .strict()
  .refine((p) => p.de <= p.ate, "A data inicial precisa ser anterior ou igual à final.")
  .refine(
    (p) => diasEntre(p.de, p.ate) < MAX_DIAS_PERIODO,
    `Escolha um período de até ${MAX_DIAS_PERIODO} dias.`,
  );
export type PeriodoInadimplencia = z.infer<typeof periodoInadimplenciaSchema>;

/** Diferença em dias corridos entre duas datas ISO (AAAA-MM-DD). */
export function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}
export const hojeSaoPaulo = (agora: Date = new Date()) => diaComercial(agora.toISOString());
export function somarDias(iso: string, dias: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}
/** Período padrão: do primeiro dia do mês, 11 meses atrás, até hoje (São Paulo). */
export function periodoPadrao(agora: Date = new Date()): PeriodoInadimplencia {
  const hoje = hojeSaoPaulo(agora);
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1 - 11, 1)).toISOString().slice(0, 10);
  return { de: inicio, ate: hoje };
}

/** "dd/mm/aaaa" do Omie para ISO; retorna null quando a data não existe. */
export function dataOmieParaIso(valor: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return dataIsoSchema.safeParse(iso).success ? iso : null;
}

const codigoSchema = z
  .union([z.number(), z.string().trim().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().nonnegative().safe());

/**
 * Campos lidos de cada item de `conta_receber_cadastro` (ListarContasReceber).
 * O objeto não é estrito: campos extras do Omie são ignorados. `codigo_vendedor`,
 * `numero_documento` e `numero_parcela` são opcionais porque nem toda conta os informa.
 */
export const tituloOmieSchema = z.object({
  codigo_lancamento_omie: codigoSchema.pipe(z.number().positive()),
  codigo_cliente_fornecedor: codigoSchema.pipe(z.number().positive()),
  data_vencimento: z.string(),
  valor_documento: z.number().finite().nonnegative(),
  status_titulo: z.string().trim().min(1),
  numero_documento: z.union([z.string(), z.number()]).nullish(),
  numero_parcela: z.union([z.string(), z.number()]).nullish(),
  codigo_vendedor: codigoSchema.nullish().catch(null),
});

export type SituacaoTitulo = "recebido" | "cancelado" | "aberto" | "desconhecido";
const SITUACOES: Record<string, SituacaoTitulo> = {
  RECEBIDO: "recebido",
  PAGO: "recebido",
  LIQUIDADO: "recebido",
  CANCELADO: "cancelado",
  "A VENCER": "aberto",
  ATRASADO: "aberto",
  "VENCE HOJE": "aberto",
  "EM ABERTO": "aberto",
  ABERTO: "aberto",
};
export function classificarStatus(status: string): SituacaoTitulo {
  const chave = status
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return SITUACOES[chave] ?? "desconhecido";
}

export type Titulo = {
  id: number;
  cliente: number;
  vendedor: number | null;
  vencimento: string;
  valor: number;
  situacao: SituacaoTitulo;
  status: string;
  documento: string;
};

/** Valida e normaliza os registros brutos. Nunca completa campos ausentes. */
export function normalizarTitulos(registros: unknown[]) {
  const titulos = new Map<number, Titulo>();
  let invalidos = 0;
  let duplicados = 0;
  for (const registro of registros) {
    const r = tituloOmieSchema.safeParse(registro);
    const vencimento = r.success ? dataOmieParaIso(r.data.data_vencimento) : null;
    if (!r.success || !vencimento) {
      invalidos++;
      continue;
    }
    const t = r.data;
    if (titulos.has(t.codigo_lancamento_omie)) {
      duplicados++;
      continue;
    }
    const documento = [t.numero_documento, t.numero_parcela]
      .filter((v) => v !== null && v !== undefined && String(v).trim())
      .map((v) => String(v).trim())
      .join(" / ");
    titulos.set(t.codigo_lancamento_omie, {
      id: t.codigo_lancamento_omie,
      cliente: t.codigo_cliente_fornecedor,
      vendedor: t.codigo_vendedor ? t.codigo_vendedor : null,
      vencimento,
      valor: Math.round(t.valor_documento * 100),
      situacao: classificarStatus(t.status_titulo),
      status: t.status_titulo.trim(),
      documento,
    });
  }
  return { titulos: [...titulos.values()], invalidos, duplicados };
}

export const FAIXAS_ATRASO = [
  { id: "1-15", rotulo: "1 a 15 dias", ate: 15 },
  { id: "16-30", rotulo: "16 a 30 dias", ate: 30 },
  { id: "31-60", rotulo: "31 a 60 dias", ate: 60 },
  { id: "61-90", rotulo: "61 a 90 dias", ate: 90 },
  { id: "90+", rotulo: "Mais de 90 dias", ate: Number.POSITIVE_INFINITY },
] as const;
export type FaixaAtraso = (typeof FAIXAS_ATRASO)[number]["id"];
export function faixaAtraso(dias: number): FaixaAtraso {
  if (!Number.isInteger(dias) || dias < 1) throw Error("Título não vencido.");
  return FAIXAS_ATRASO.find((f) => dias <= f.ate)!.id;
}

type Soma = { quantidade: number; valor: number };
const soma = (): Soma => ({ quantidade: 0, valor: 0 });
const somar = (s: Soma, valor: number) => {
  s.quantidade++;
  s.valor += valor;
};
/** Percentual com duas casas a partir de inteiros; null quando não há base. */
export function percentual(numerador: number, denominador: number) {
  return denominador > 0 ? Math.round((numerador * 10000) / denominador) / 100 : null;
}

export type ClienteInadimplente = {
  cliente: number;
  nome: string | null;
  quantidade: number;
  valor: number;
  maiorAtraso: number;
  vencimentoMaisAntigo: string;
};
export type VendedorInadimplencia = {
  vendedor: number | null;
  nome: string | null;
  vencidoQuantidade: number;
  vencidoValor: number;
  emAbertoQuantidade: number;
  emAbertoValor: number;
  indiceValor: number | null;
};

/**
 * Posição de inadimplência em `hoje` dos títulos com vencimento no período.
 * - Base vencida: títulos não cancelados com vencimento no período e anterior a hoje.
 * - Inadimplente: título da base ainda em aberto (sem baixa de recebimento).
 * - Índice (valor) = valor em aberto vencido / valor da base vencida.
 * - Índice (títulos) = títulos em aberto vencidos / títulos da base vencida.
 */
export function calcularInadimplencia(
  titulos: Titulo[],
  periodo: PeriodoInadimplencia,
  hoje: string,
) {
  const total = soma(),
    recebido = soma(),
    aVencer = soma(),
    vencidoAberto = soma(),
    baseVencida = soma(),
    cancelados = soma(),
    naoClassificados = soma();
  const faixas = new Map<FaixaAtraso, Soma>(FAIXAS_ATRASO.map((f) => [f.id, soma()]));
  const clientes = new Map<number, ClienteInadimplente>();
  const vendedores = new Map<number | null, VendedorInadimplencia>();
  const statusDesconhecidos = new Set<string>();
  let foraDoPeriodo = 0;

  for (const t of titulos) {
    if (t.vencimento < periodo.de || t.vencimento > periodo.ate) {
      foraDoPeriodo++;
      continue;
    }
    if (t.situacao === "cancelado") {
      somar(cancelados, t.valor);
      continue;
    }
    if (t.situacao === "desconhecido") {
      somar(naoClassificados, t.valor);
      statusDesconhecidos.add(t.status);
      continue;
    }
    somar(total, t.valor);
    if (t.vencimento >= hoje) {
      // Vence hoje ou no futuro: ainda não entra na base do índice.
      somar(t.situacao === "recebido" ? recebido : aVencer, t.valor);
      continue;
    }
    somar(baseVencida, t.valor);
    const vendedor = vendedores.get(t.vendedor) ?? {
      vendedor: t.vendedor,
      nome: null,
      vencidoQuantidade: 0,
      vencidoValor: 0,
      emAbertoQuantidade: 0,
      emAbertoValor: 0,
      indiceValor: null,
    };
    vendedores.set(t.vendedor, vendedor);
    vendedor.vencidoQuantidade++;
    vendedor.vencidoValor += t.valor;
    if (t.situacao === "recebido") {
      somar(recebido, t.valor);
      continue;
    }
    const dias = diasEntre(t.vencimento, hoje);
    somar(vencidoAberto, t.valor);
    somar(faixas.get(faixaAtraso(dias))!, t.valor);
    vendedor.emAbertoQuantidade++;
    vendedor.emAbertoValor += t.valor;
    const c = clientes.get(t.cliente) ?? {
      cliente: t.cliente,
      nome: null,
      quantidade: 0,
      valor: 0,
      maiorAtraso: 0,
      vencimentoMaisAntigo: t.vencimento,
    };
    c.quantidade++;
    c.valor += t.valor;
    c.maiorAtraso = Math.max(c.maiorAtraso, dias);
    if (t.vencimento < c.vencimentoMaisAntigo) c.vencimentoMaisAntigo = t.vencimento;
    clientes.set(t.cliente, c);
  }

  return {
    periodo,
    hoje,
    indiceValor: percentual(vencidoAberto.valor, baseVencida.valor),
    indiceQuantidade: percentual(vencidoAberto.quantidade, baseVencida.quantidade),
    total,
    recebido,
    aVencer,
    vencidoAberto,
    baseVencida,
    cancelados,
    naoClassificados,
    statusDesconhecidos: [...statusDesconhecidos].sort(),
    foraDoPeriodo,
    faixas: FAIXAS_ATRASO.map((f) => ({ id: f.id, rotulo: f.rotulo, ...faixas.get(f.id)! })),
    clientes: [...clientes.values()].sort(
      (a, b) => b.valor - a.valor || b.maiorAtraso - a.maiorAtraso || a.cliente - b.cliente,
    ),
    vendedores: [...vendedores.values()]
      .map((v) => ({ ...v, indiceValor: percentual(v.emAbertoValor, v.vencidoValor) }))
      .sort(
        (a, b) =>
          b.emAbertoValor - a.emAbertoValor ||
          (a.vendedor ?? Number.MAX_SAFE_INTEGER) - (b.vendedor ?? Number.MAX_SAFE_INTEGER),
      ),
  };
}
export type ResultadoInadimplencia = ReturnType<typeof calcularInadimplencia> & {
  geradoEm: string;
  titulosLidos: number;
  invalidos: number;
  duplicados: number;
  avisos: string[];
};

// ---------- Formatação e CSV ----------
export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBrIso = (iso: string) => iso.split("-").reverse().join("/");
export const percentualBr = (v: number | null) =>
  v === null ? "Sem base" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`;
/** Centavos inteiros como "1234,56", sem passar por ponto flutuante. */
function decimalCsv(centavos: number) {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
export const nomeCliente = (c: { cliente: number; nome: string | null }) =>
  c.nome ?? `Cliente Omie ${c.cliente}`;
export const nomeVendedor = (v: { vendedor: number | null; nome: string | null }) =>
  v.vendedor === null ? "Sem vendedor informado" : (v.nome ?? `Vendedor Omie ${v.vendedor}`);

/** CSV pt-BR (BOM, separador ;) com células neutralizadas contra fórmulas. */
export function csvInadimplencia(r: ResultadoInadimplencia) {
  type Celula = string | number | null;
  const linhas: Celula[][] = [
    ["Inadimplência MiMo (Omie · Contas a Receber)"],
    ["Vencimentos de", dataBrIso(r.periodo.de), "até", dataBrIso(r.periodo.ate)],
    ["Posição em", dataBrIso(r.hoje)],
    [],
    ["Indicador", "Valor (R$)", "Títulos"],
    ["Índice de inadimplência (valor) %", r.indiceValor, null],
    ["Índice de inadimplência (títulos) %", null, r.indiceQuantidade],
    ["Total do período (sem cancelados)", decimalCsv(r.total.valor), r.total.quantidade],
    ["Recebido", decimalCsv(r.recebido.valor), r.recebido.quantidade],
    ["A receber (a vencer)", decimalCsv(r.aVencer.valor), r.aVencer.quantidade],
    ["Vencido em aberto", decimalCsv(r.vencidoAberto.valor), r.vencidoAberto.quantidade],
    ["Base vencida", decimalCsv(r.baseVencida.valor), r.baseVencida.quantidade],
    ["Cancelados (excluídos)", decimalCsv(r.cancelados.valor), r.cancelados.quantidade],
    [
      "Status não reconhecido (excluídos)",
      decimalCsv(r.naoClassificados.valor),
      r.naoClassificados.quantidade,
    ],
    [],
    ["Faixa de atraso", "Valor (R$)", "Títulos"],
    ...r.faixas.map((f) => [f.rotulo, decimalCsv(f.valor), f.quantidade]),
    [],
    [
      "Cliente",
      "Código Omie",
      "Vencido em aberto (R$)",
      "Títulos",
      "Maior atraso (dias)",
      "Vencimento mais antigo",
    ],
    ...r.clientes.map((c) => [
      nomeCliente(c),
      String(c.cliente),
      decimalCsv(c.valor),
      c.quantidade,
      c.maiorAtraso,
      dataBrIso(c.vencimentoMaisAntigo),
    ]),
    [],
    [
      "Vendedor",
      "Código Omie",
      "Base vencida (R$)",
      "Vencido em aberto (R$)",
      "Títulos em aberto",
      "Índice (valor) %",
    ],
    ...r.vendedores.map((v) => [
      nomeVendedor(v),
      v.vendedor === null ? "" : String(v.vendedor),
      decimalCsv(v.vencidoValor),
      decimalCsv(v.emAbertoValor),
      v.emAbertoQuantidade,
      v.indiceValor,
    ]),
  ];
  return "﻿" + linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";
}
