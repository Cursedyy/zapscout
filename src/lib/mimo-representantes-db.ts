import type { Database, Json } from "@/integrations/supabase/types";
import type { Representante, HistoricoRepresentante } from "./mimo-representantes";
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
export type RepresentantesDB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_representantes: Table<Representante>;
      mimo_representantes_historico: Table<HistoricoRepresentante>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_inscrever_representante: { Args: { p_dados: Json; p_ip_hash: string }; Returns: Json };
      mimo_representante_excluir: { Args: { p_id: string; p_versao: number }; Returns: boolean };
    };
  };
};
