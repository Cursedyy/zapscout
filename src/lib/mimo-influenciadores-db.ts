import type { Database, Json } from "@/integrations/supabase/types";
import type { Influenciador, HistoricoInfluenciador } from "./mimo-influenciadores";
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
export type InfluenciadoresDB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_influenciadores: Table<Influenciador>;
      mimo_influenciadores_historico: Table<
        HistoricoInfluenciador & { empresa_id: string; influenciador_id: string }
      >;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_inscrever_influenciador: { Args: { p_dados: Json; p_ip_hash: string }; Returns: Json };
      mimo_influenciador_excluir: { Args: { p_id: string; p_versao: number }; Returns: boolean };
    };
  };
};
