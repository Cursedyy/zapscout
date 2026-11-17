import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  detectarLeadQuente,
  textoAlertaQuente,
  type MensagemObservada,
  type SinalQuente,
} from "./mimo-agente-quentes";
import { obterRemetenteAgente } from "./mimo-agente-worker.server";
import { processarAvisoInterno } from "./mimo-follow-aviso-processador";
import {
  uazSendText,
  uazLocalizarGrupoQuentes,
  uazConfirmarGrupoQuentes,
  uazEnviarGrupoQuentes,
} from "./uazapi.server";
type Db = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      mimo_quentes_operar: { Args: { _acao: string; _p: Json }; Returns: Json };
      mimo_quentes_grupo: { Args: { _acao: string; _p: Json }; Returns: Json };
    };
  };
};
export async function executarObservacaoMimo() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient<Db>;
  const op = async <T>(acao: string, p: unknown = {}): Promise<T> => {
    const r = await db.rpc("mimo_quentes_operar", { _acao: acao, _p: p as Json });
    if (r.error) throw Error("observacao_indisponivel");
    return r.data as T;
  };
  const grupoOp = async <T>(acao: string, p: unknown = {}): Promise<T> => {
    const r = await db.rpc("mimo_quentes_grupo", { _acao: acao, _p: p as Json });
    if (r.error) throw Error("grupo_configuracao_indisponivel");
    return r.data as T;
  };
  const pedido = await grupoOp<null | {
    empresa: string;
    vinculo: string;
    versao: number;
    status: string;
    atualizar?: boolean;
  }>("consultar");
  if (pedido?.status === "pendente") {
    const token = await obterRemetenteAgente(pedido.empresa, pedido.vinculo);
    if (!token) return "remetente_pendente";
    try {
      const jid = await uazLocalizarGrupoQuentes(token, pedido.atualizar === true);
      const grupo = await uazConfirmarGrupoQuentes(token, jid);
      await grupoOp("confirmar", {
        empresa: pedido.empresa,
        versao: pedido.versao,
        jid: grupo.jid,
        nome: grupo.nome,
      });
    } catch (erro) {
      await grupoOp("diagnostico", {
        empresa: pedido.empresa,
        versao: pedido.versao,
        erro: erro instanceof Error ? erro.message : "grupo_indisponivel",
      });
      return "grupo_pendente";
    }
  } else if (pedido?.status === "teste")
    await grupoOp("ativar", { empresa: pedido.empresa, versao: pedido.versao });
  // Bounded batches drain bursts without delaying the internal notification indefinitely.
  for (let i = 0; i < 8; i++) {
    const a = await op<null | {
      empresa_id: string;
      lead_id: string;
      reserva: string;
      sequencia: number;
      mensagens: MensagemObservada[];
    }>("reservar_analise");
    if (!a) break;
    await op("registrar_sinal", {
      empresa_id: a.empresa_id,
      lead_id: a.lead_id,
      reserva: a.reserva,
      sequencia: a.sequencia,
      ...detectarLeadQuente(a.mensagens),
    });
  }
  const q = await op<null | {
    id: string;
    reserva: string;
    empresa_id: string;
    vinculo_id: string;
    config_versao: number;
    destino: string;
    tipo: "teste" | "lead";
    nome: string;
    telefone: string;
    sinal: SinalQuente;
  }>("reservar_alerta");
  if (!q) return "sem_alertas";
  const chave = { id: q.id, reserva: q.reserva };
  let grupo: Awaited<ReturnType<typeof uazConfirmarGrupoQuentes>> | null = null;
  const resultado = await processarAvisoInterno({
    preparar: async () => {
      const token = await obterRemetenteAgente(q.empresa_id, q.vinculo_id);
      if (!token) return null;
      if (q.destino.endsWith("@g.us")) grupo = await uazConfirmarGrupoQuentes(token, q.destino);
      return {
        token,
        numero: q.destino,
        texto:
          q.tipo === "teste"
            ? "MiMo · avisos de leads quentes\nEste destino receberá nome, contato e sinal de interesse dos novos leads qualificados. Nenhum lead antigo foi encaminhado neste teste."
            : textoAlertaQuente(q.nome, q.telefone, q.sinal),
      };
    },
    autorizar: () => op<boolean>("autorizar_alerta", chave),
    enviar: (token, numero, texto) =>
      grupo ? uazEnviarGrupoQuentes(token, grupo, texto) : uazSendText(token, numero, texto),
    finalizar: async (aceita, id) => {
      if (!(await op<boolean>("finalizar_alerta", { ...chave, message_id: aceita ? id : null })))
        throw Error("observacao_registro_indisponivel");
    },
  });
  if (q.tipo === "teste" && grupo && resultado === "aceita")
    await grupoOp("ativar", { empresa: q.empresa_id, versao: q.config_versao });
  return resultado;
}
