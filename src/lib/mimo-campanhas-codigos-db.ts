import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

/** Tipos da migração preparada docs/migracoes-preparadas/mimo-campanhas-codigo.sql (ainda não gerados). */
type T<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
export type CodigoCampanhaRow = {
  id: string;
  empresa_id: string;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  versao: number;
  criado_por: string;
  atualizado_por: string;
  created_at: string;
  updated_at: string;
};
export type VinculoMetaRow = {
  empresa_id: string;
  campanha_id: string;
  codigo_id: string;
  criado_por: string;
  created_at: string;
};
export type InvestimentoManualRow = {
  id: string;
  empresa_id: string;
  codigo_id: string;
  competencia: string;
  valor_centavos: number;
  descricao: string;
  lancado_por: string;
  created_at: string;
  anulado_em: string | null;
  anulado_por: string | null;
  motivo_anulacao: string;
};
export type HistoricoCodigoRow = {
  id: number;
  empresa_id: string;
  codigo_id: string;
  alterado_por: string | null;
  acao: string;
  anterior: Json | null;
  atual: Json;
  created_at: string;
};
type LeadComCodigo = Database["public"]["Tables"]["mimo_leads"]["Row"] & {
  campanha_codigo_id: string | null;
  campanha_codigo_origem: string | null;
};

export type CodigosDb = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], "mimo_leads"> & {
      mimo_leads: T<LeadComCodigo>;
      mimo_campanhas_codigos: T<CodigoCampanhaRow>;
      mimo_campanhas_codigos_meta: T<VinculoMetaRow>;
      mimo_campanhas_codigos_investimentos: T<InvestimentoManualRow>;
      mimo_campanhas_codigos_historico: T<HistoricoCodigoRow>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_codigo_campanha_salvar: {
        Args: {
          _empresa: string;
          _id: string | null;
          _versao: number | null;
          _codigo: string;
          _nome: string;
          _descricao: string;
          _ativo: boolean;
          _campanhas_meta: string[];
        };
        Returns: { id: string; versao: number };
      };
      mimo_codigo_campanha_lancar_investimento: {
        Args: {
          _empresa: string;
          _codigo: string;
          _competencia: string;
          _valor_centavos: number;
          _descricao: string;
        };
        Returns: string;
      };
      mimo_codigo_campanha_anular_investimento: {
        Args: { _empresa: string; _id: string; _motivo: string };
        Returns: undefined;
      };
      mimo_codigo_campanha_preencher_historico: { Args: { _empresa: string }; Returns: number };
    };
  };
};
export const codigosDb = (db: SupabaseClient<Database>) =>
  db as unknown as SupabaseClient<CodigosDb>;

/** Tabela/coluna/função da migração preparada ainda ausente no banco. */
export function faltaMigracaoCodigos(erro: { code?: string; message?: string } | null | undefined) {
  if (!erro) return false;
  return (
    ["42P01", "PGRST205", "42883", "PGRST202"].includes(erro.code ?? "") ||
    (["42703", "PGRST204"].includes(erro.code ?? "") && /campanha_codigo/i.test(erro.message ?? ""))
  );
}
