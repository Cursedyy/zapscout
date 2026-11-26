import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirMimo } from "./mimo-leads.server";
import { calcularVendasMensais, edicaoVendasSchema } from "./mimo-vendas-mensais";

type BancoVendas = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & { mimo_vendas_mensais: {
      Row: { empresa_id: string; competencia: string; demonstrativo: Json; ajustes: Json };
      Insert: never; Update: never; Relationships: [];
    } };
    Functions: Database["public"]["Functions"] & { mimo_vendas_definir_valor: {
      Args: { _empresa: string; _competencia: string; _dia: string | null; _esperado: number; _valor: number };
      Returns: Json;
    } };
  };
};

async function gestao(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { empresaId, papel } = await exigirMimo(context.supabase, context.userId);
  if (papel !== "administrador" && papel !== "gestor") throw Error("Acesso negado.");
  return { empresaId, db: context.supabase as unknown as SupabaseClient<BancoVendas> };
}

export const consultarVendasMensais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { empresaId, db } = await gestao(context);
    const { data, error } = await db.from("mimo_vendas_mensais")
      .select("competencia,demonstrativo,ajustes").eq("empresa_id", empresaId)
      .order("competencia", { ascending: false }).limit(1).maybeSingle();
    if (error) throw Error("Não foi possível carregar o acompanhamento de vendas.");
    return data ? calcularVendasMensais(data) : null;
  });

export const salvarValorVendas = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => edicaoVendasSchema.parse(v))
  .handler(async ({ context, data }) => {
    const { empresaId, db } = await gestao(context);
    const resposta = await db.rpc("mimo_vendas_definir_valor", {
      _empresa: empresaId, _competencia: data.competencia, _dia: data.dia as string, _esperado: data.esperado, _valor: data.valor,
    });
    if (resposta.error?.code === "40001") throw Error("Outra pessoa alterou este valor. Cancele a edição e confira o valor atualizado.");
    if (resposta.error) throw Error("Não foi possível salvar. Atualize a tabela e tente novamente.");
    return calcularVendasMensais(resposta.data);
  });
