import type { SupabaseClient } from "@supabase/supabase-js";
import { numeroIgnoradoIA } from "./ia-numeros-ignorados";

export async function contatoIgnoradoIA(db: SupabaseClient, userId: string, numero: string): Promise<boolean> {
  const { data, error } = await db.from("ia_config").select("numeros_ignorados").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Não foi possível verificar os números excluídos da IA.");
  return numeroIgnoradoIA(data?.numeros_ignorados, numero);
}