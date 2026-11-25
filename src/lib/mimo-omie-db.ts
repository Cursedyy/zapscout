import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { MudancaCfop } from "./mimo-omie";

type Previa = {
  id: string;
  empresa_id: string;
  ator_id: string;
  pedido_id: number;
  versao: string;
  mudancas: MudancaCfop[];
  expira_em: string;
  estado: "previa" | "simulada" | "obsoleta" | "expirada";
  created_at: string;
};
type OmieDB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_omie_previas: { Row: Previa; Insert: never; Update: never; Relationships: [] };
    };
    Functions: Database["public"]["Functions"] & {
      mimo_omie_preparar: {
        Args: {
          p_empresa: string;
          p_ator: string;
          p_pedido: number;
          p_versao: string;
          p_mudancas: Json;
          p_idempotencia: string;
        };
        Returns: string;
      };
      mimo_omie_confirmar: {
        Args: { p_empresa: string; p_ator: string; p_id: string; p_versao: string };
        Returns: string;
      };
    };
  };
};
export const omieDB = (db: SupabaseClient<Database>) => db as unknown as SupabaseClient<OmieDB>;
