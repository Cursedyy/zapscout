import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirMimo } from "./mimo-leads.server";

const totais = z.object({
  orcado: z.number().int().nonnegative(),
  realizado: z.number().int().nonnegative(),
  coberturaBps: z.number().int().nonnegative(),
  diferenca: z.number().int(),
});
const dia = totais.extend({ data: z.iso.date(), feriado: z.boolean() });
const demonstrativo = z.object({
  semanas: z.array(z.object({ numero: z.number().int().min(1).max(6), dias: z.array(dia).min(1).max(7), total: totais })).min(1).max(6),
  total: totais,
});
export type TotaisVendas = z.infer<typeof totais>;
export type VendasMensais = z.infer<typeof demonstrativo> & { competencia: string };

type BancoVendas = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & { mimo_vendas_mensais: {
      Row: { empresa_id: string; competencia: string; demonstrativo: Json };
      Insert: never; Update: never; Relationships: [];
    } };
  };
};

export const consultarVendasMensais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendasMensais | null> => {
    const { empresaId, papel } = await exigirMimo(context.supabase, context.userId);
    if (papel !== "administrador" && papel !== "gestor") throw Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<BancoVendas>;
    const { data, error } = await db.from("mimo_vendas_mensais")
      .select("competencia,demonstrativo").eq("empresa_id", empresaId)
      .order("competencia", { ascending: false }).limit(1).maybeSingle();
    if (error) throw Error("Não foi possível carregar o acompanhamento de vendas.");
    if (!data) return null;
    return { competencia: data.competencia, ...demonstrativo.parse(data.demonstrativo) };
  });
