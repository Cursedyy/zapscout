import { z } from "zod";
import { ehMarketing } from "./mimo-acesso";

/**
 * Código de campanha (centro de custo de marketing). Módulo puro, compartilhado por UI e servidor.
 * A atribuição é sempre exata: lead.campanha_codigo_id, pedido.lead_id e campanha_id Meta vinculada.
 */
export const CODIGO_CAMPANHA_REGEX = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
export const ID_META_REGEX = /^\d{1,40}$/;
export const ORIGENS_CODIGO = {
  manual: "Manual",
  anuncio_meta: "Anúncio Meta (automático)",
} as const;
export type OrigemCodigo = keyof typeof ORIGENS_CODIGO;

export const podeGerirCodigos = (papel: string) =>
  ["administrador", "gestor"].includes(papel) || ehMarketing(papel);
/** Preencher leads antigos altera registros comerciais: só administração e gestão. */
export const podePreencherHistoricoCodigos = (papel: string) =>
  ["administrador", "gestor"].includes(papel);

export const normalizarCodigo = (v: string) => v.trim().toUpperCase();

/** Aceita IDs separados por vírgula, espaço, ponto e vírgula ou quebra de linha. */
export function analisarIdsMeta(texto: string): { ids: string[]; invalidos: string[] } {
  const partes = texto
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const ids = [...new Set(partes.filter((p) => ID_META_REGEX.test(p)))].sort();
  return { ids, invalidos: partes.filter((p) => !ID_META_REGEX.test(p)) };
}

export const codigoCampanhaSchema = z
  .object({
    id: z.string().uuid().nullable(),
    versao: z.number().int().min(1).nullable(),
    codigo: z
      .string()
      .transform(normalizarCodigo)
      .refine(
        (v) => CODIGO_CAMPANHA_REGEX.test(v),
        "Use de 2 a 40 letras, números, - ou _, começando por letra ou número.",
      ),
    nome: z.string().trim().min(2, "Informe o nome.").max(120),
    descricao: z.string().trim().max(1000),
    ativo: z.boolean(),
    campanhasMeta: z
      .array(z.string().regex(ID_META_REGEX, "ID de campanha Meta inválido."))
      .max(100),
  })
  .strict()
  .refine((v) => (v.id === null) === (v.versao === null), "Reabra o código antes de salvar.");
export type CodigoCampanhaInput = z.infer<typeof codigoCampanhaSchema>;

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2020-01-01";
  }, "Data inválida.");

export const investimentoManualSchema = z
  .object({
    codigoId: z.string().uuid(),
    competencia: dataIso,
    valorCentavos: z.number().int().min(0).max(100_000_000_000),
    descricao: z.string().trim().min(2, "Descreva o investimento.").max(300),
  })
  .strict();
export type InvestimentoManualInput = z.infer<typeof investimentoManualSchema>;

export const anularInvestimentoSchema = z
  .object({ id: z.string().uuid(), motivo: z.string().trim().min(2, "Informe o motivo.").max(300) })
  .strict();

/** Converte "1.234,56" ou "1234.56" em centavos inteiros, sem arredondamento de ponto flutuante. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\s|R\$/g, "");
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(normal);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export type CodigoRetorno = {
  id: string;
  empresa_id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
};
export type VinculoMetaRetorno = { empresa_id: string; codigo_id: string; campanha_id: string };
export type InvestimentoManualRetorno = {
  id: string;
  empresa_id: string;
  codigo_id: string;
  competencia: string;
  valor_centavos: number;
  anulado_em: string | null;
};
export type DadosCodigosRetorno = {
  codigos: CodigoRetorno[];
  vinculos: VinculoMetaRetorno[];
  investimentos: InvestimentoManualRetorno[];
  /** false quando o esquema Meta ainda não tem IDs: o investimento Meta vinculado fica indisponível. */
  metaComIds: boolean;
};
