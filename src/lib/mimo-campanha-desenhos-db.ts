import type { Database, Json } from "@/integrations/supabase/types";
import type { MimeDesenho } from "./mimo-campanha-desenhos";

export type DesenhoRecebido = {
  id: string;
  empresa_id: string;
  instagram: string;
  mime: MimeDesenho;
  tamanho: number;
  hash_arquivo: string;
  recebido_em: string | null;
};

export type DesenhosDB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_campanha_desenhos: {
        Row: DesenhoRecebido;
        Insert: never;
        Update: { recebido_em: string };
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      mimo_reservar_desenho: {
        Args: {
          p_id: string;
          p_instagram: string;
          p_mime: MimeDesenho;
          p_tamanho: number;
          p_hash: string;
          p_ip_hash: string;
        };
        Returns: Json;
      };
    };
  };
};
