import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      mimo_agente_operar: {
        Args: { _empresa: string; _ator: string; _acao: string; _p: Json };
        Returns: Json;
      };
      mimo_agente_worker: { Args: { _acao: string; _p: Json }; Returns: Json };
      mimo_agente_material: {
        Args: {
          _empresa: string;
          _ator: string;
          _id: string;
          _nome?: string;
          _tipo?: string;
          _path?: string;
          _mime?: string;
        };
        Returns: undefined;
      };
    };
  };
};
const db = supabaseAdmin as unknown as SupabaseClient<DB>;
export async function registrarMaterialAgente(
  empresa: string,
  ator: string,
  id: string,
  arquivo?: { nome: string; tipo: string; path: string; mime: string },
) {
  const r = await db.rpc("mimo_agente_material", {
    _empresa: empresa,
    _ator: ator,
    _id: id,
    ...(arquivo
      ? { _nome: arquivo.nome, _tipo: arquivo.tipo, _path: arquivo.path, _mime: arquivo.mime }
      : {}),
  });
  if (r.error) throw Error("Não foi possível registrar o material privado.");
}
export async function operarAgente(
  empresa: string,
  ator: string,
  acao: string,
  payload: unknown = {},
) {
  const r = await db.rpc("mimo_agente_operar", {
    _empresa: empresa,
    _ator: ator,
    _acao: acao,
    _p: payload as Json,
  });
  if (r.error)
    throw Error(
      r.error.code === "P0001"
        ? r.error.message
        : "Não foi possível acessar o agente. Confira a preparação do banco.",
    );
  return r.data;
}
export async function workerAgente(acao: string, payload: unknown = {}) {
  const r = await db.rpc("mimo_agente_worker", { _acao: acao, _p: payload as Json });
  if (r.error) throw Error("agente_fila_indisponivel");
  return r.data;
}
