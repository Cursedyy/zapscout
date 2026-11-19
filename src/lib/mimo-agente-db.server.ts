import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Omit<Database["public"]["Functions"], "mimo_conversa_comercial"> & {
      mimo_agente_operar: {
        Args: { _empresa: string; _ator: string; _acao: string; _p: Json };
        Returns: Json;
      };
      mimo_agente_worker: { Args: { _acao: string; _p: Json }; Returns: Json };
      mimo_conversa_comercial: {
        Args: { _empresa: string; _ator: string; _lead: string | null; _acao: string; _p: Json };
        Returns: Json;
      };
      mimo_agente_audio: { Args: { _p: Json }; Returns: Json };
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
export async function audioAgente(payload: unknown) {
  const r = await db.rpc("mimo_agente_audio", { _p: payload as Json });
  if (r.error) throw Error("agente_audio_indisponivel");
  return r.data;
}
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

async function chamarConversaComercial(
  empresa: string,
  ator: string,
  lead: string | null,
  acao: "reservar" | "autorizar" | "linha_pessoal_disponivel",
  payload: Json,
) {
  return db.rpc("mimo_conversa_comercial", {
    _empresa: empresa, _ator: ator, _lead: lead, _acao: acao, _p: payload,
  });
}
// Hotfix: the production RPC still picks the shared entry line. Keep personal sends off until
// the prepared personal-line migration is applied and verified; never probe the old RPC.
export const CONVERSA_PESSOAL_LIBERADA = false;
export async function suportaConversaPessoal(empresa: string, ator: string) {
  if (!CONVERSA_PESSOAL_LIBERADA) return false;
  // A null lead also makes the old RPC fail before touching a conversation; its transaction rolls back.
  const { data, error } = await chamarConversaComercial(empresa, ator, null, "linha_pessoal_disponivel", {});
  return !error && data === true;
}
export async function operarConversaComercial(
  empresa: string,
  ator: string,
  lead: string,
  acao: "reservar" | "autorizar",
  payload: Json,
) {
  const { data, error } = await chamarConversaComercial(empresa, ator, lead, acao, payload);
  if (error?.code === "PGRST202" || error?.code === "42883") return { estado: "indisponivel" };
  if (error) throw Error("Não foi possível processar a mensagem.");
  return data;
}
