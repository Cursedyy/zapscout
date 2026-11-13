import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
type NomeRpc =
  | "mimo_email_oauth_iniciar"
  | "mimo_email_oauth_consumir"
  | "mimo_email_oauth_falhar"
  | "mimo_email_oauth_salvar"
  | "mimo_email_credencial_ler"
  | "mimo_email_painel"
  | "mimo_email_configurar"
  | "mimo_email_processamento"
  | "mimo_email_reservar"
  | "mimo_email_autorizar"
  | "mimo_email_concluir"
  | "mimo_email_descadastro_contexto"
  | "mimo_email_descadastrar"
  | "mimo_email_teste_reservar"
  | "mimo_email_teste_concluir"
  | "mimo_email_diagnostico";
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Omit<Database["public"]["Functions"], NomeRpc> &
      Record<NomeRpc, { Args: Record<string, Json>; Returns: Json }>;
  };
};
export class ErroEmailRpc extends Error {
  constructor(readonly codigo: string) {
    super("Não foi possível concluir a operação de e-mail.");
  }
}
export async function rpcEmail(nome: NomeRpc, args: Record<string, Json>) {
  const r = await (supabaseAdmin as unknown as SupabaseClient<DB>).rpc(nome, args);
  if (r.error) throw new ErroEmailRpc(r.error.code);
  return r.data;
}
