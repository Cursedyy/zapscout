import type { Database, Json } from "@/integrations/supabase/types";
export type FichaRevenda = { id: string; empresa_id: string; lead_id: string; telefone: string; respostas: Json; minimo_centavos: number; created_at: string };
export type RevendaDB = Omit<Database, "public"> & { public: Omit<Database["public"], "Tables" | "Functions"> & {
  Tables: Database["public"]["Tables"] & { mimo_revenda_inscricoes: { Row: FichaRevenda; Insert: Partial<FichaRevenda>; Update: Partial<FichaRevenda>; Relationships: [] } };
  Functions: Database["public"]["Functions"] & { mimo_inscrever_revenda: { Args: { p_dados: Json; p_ip_hash: string }; Returns: Json } };
} };

