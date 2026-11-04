import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  documentoSchema,
  calcular,
  aplicarPoliticas,
  revisar,
  type Documento,
} from "./mimo-pricing";

export type RegistroPricing = {
  id: string;
  tipo: "base" | "cenario";
  versao: number;
  dados: Documento;
  updated_at: string;
};
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_pricing_origens: {
        Row: { empresa_id: string; hash: string; origem: string; dados: Documento };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      mimo_carteira_unidades: {
        Row: { id: string; nome: string; uf: string; empresa_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      mimo_pricing_documentos: {
        Row: RegistroPricing & { empresa_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      mimo_pricing_salvar: {
        Args: {
          _empresa: string;
          _id: string | null;
          _versao: number;
          _tipo: string;
          _dados: Json;
          _hash: string | null;
          _origem: string | null;
        };
        Returns: string;
      };
    };
  };
};
async function acesso(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(context.supabase, context.userId);
  if (!["administrador", "gestor"].includes(a.papel))
    throw Error("Acesso exclusivo à administração e gestão.");
  return { ...a, db: context.supabase as unknown as SupabaseClient<DB> };
}
export const carregarPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const { data, error } = await a.db
      .from("mimo_pricing_documentos")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .order("updated_at", { ascending: false });
    if (error) throw Error("Não foi possível carregar a Árvore Comercial.");
    return data;
  });
export const buscarClientesPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.string().trim().max(100).parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    const { data: clientes, error } = await a.db
      .from("mimo_carteira_unidades")
      .select("id,nome,uf")
      .eq("empresa_id", a.empresaId)
      .ilike("nome", `%${data.replace(/[%_]/g, "")}%`)
      .order("nome")
      .limit(40);
    if (error) throw Error("Não foi possível buscar clientes.");
    return clientes;
  });
const entrada = z.object({
  id: z.string().uuid().nullable(),
  versao: z.number().int().nonnegative(),
  tipo: z.enum(["base", "cenario"]),
  dados: documentoSchema,
});
export const salvarPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => entrada.parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    // Revalidate every calculation; never accept client-provided result fields.
    data.dados.linhas.forEach((l) =>
      calcular(aplicarPoliticas(l, data.dados.politicas, data.dados.cliente, data.dados.uf)),
    );
    const { data: id, error } = await a.db.rpc("mimo_pricing_salvar", {
      _empresa: a.empresaId,
      _id: data.id,
      _versao: data.versao,
      _tipo: data.tipo,
      _dados: data.dados as unknown as Json,
      _hash: null,
      _origem: null,
    });
    if (error) throw Error(error.message);
    return id;
  });
export const previaPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const { data: seed, error: sourceError } = await a.db
      .from("mimo_pricing_origens")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (sourceError || !seed) throw Error("Origem inicial indisponível.");
    const dados = documentoSchema.parse(seed.dados);
    const { data, error } = await a.db
      .from("mimo_pricing_documentos")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("tipo", "base")
      .maybeSingle();
    if (error) throw Error("Falha ao revisar base atual.");
    return {
      dados,
      hash: seed.hash,
      origem: seed.origem,
      base: data,
      revisao: revisar(dados.linhas, data?.dados.linhas),
    };
  });
export const confirmarPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z.object({ hash: z.string(), versao: z.number().int().nonnegative() }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    const { data: seed, error: sourceError } = await a.db
      .from("mimo_pricing_origens")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("hash", data.hash)
      .single();
    if (sourceError || !seed) throw Error("Origem mudou. Revise novamente.");
    const dados = documentoSchema.parse(seed.dados);
    const { data: base, error: readError } = await a.db
      .from("mimo_pricing_documentos")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("tipo", "base")
      .maybeSingle();
    if (readError) throw Error("Falha ao carregar base.");
    const { data: id, error } = await a.db.rpc("mimo_pricing_salvar", {
      _empresa: a.empresaId,
      _id: base?.id ?? null,
      _versao: data.versao,
      _tipo: "base",
      _dados: dados as unknown as Json,
      _hash: seed.hash,
      _origem: seed.origem,
    });
    if (error) throw Error(error.message);
    return id;
  });
