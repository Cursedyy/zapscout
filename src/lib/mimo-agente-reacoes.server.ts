import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { obterRemetenteAgente } from "./mimo-agente-worker.server";
import { uazConfirmarGrupoQuentes, uazListarReacoesGrupoQuentes } from "./uazapi.server";

type Db = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      mimo_quentes_reacoes: { Args: { _acao: string; _p: Json }; Returns: Json };
    };
  };
};
type GrupoComAvisos = { empresa: string; vinculo: string; versao: number; jid: string; desde: string };

export async function sincronizarReacoesMimo() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient<Db>;
  const consulta = await db.rpc("mimo_quentes_reacoes", { _acao: "consultar", _p: {} });
  if (consulta.error) throw Error("grupo_reacoes_configuracao_indisponivel");
  if (!consulta.data) return "sem_avisos";
  const destino = consulta.data as GrupoComAvisos;
  const token = await obterRemetenteAgente(destino.empresa, destino.vinculo);
  if (!token) return "remetente_indisponivel";
  const grupo = await uazConfirmarGrupoQuentes(token, destino.jid);
  const reacoes = await uazListarReacoesGrupoQuentes(token, grupo, destino.desde);
  let atendidos = 0;
  for (let inicio = 0; inicio < reacoes.length; inicio += 100) {
    const r = await db.rpc("mimo_quentes_reacoes", {
      _acao: "registrar",
      _p: { ...destino, reacoes: reacoes.slice(inicio, inicio + 100) },
    });
    if (r.error) throw Error("grupo_reacoes_registro_indisponivel");
    if (typeof r.data === "number") atendidos += r.data;
  }
  return { observadas: reacoes.length, atendidos };
}
