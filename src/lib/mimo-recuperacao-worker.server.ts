import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { configOAuthNuvem, obterConfigNuvem } from "./mimo-nuvemshop-oauth.server";
import { coletarNuvem, conferirCompraNuvem } from "./mimo-nuvemshop.server";
import { mensagensRecuperacaoMimo } from "./mimo-carrinhos-mensagens";
import { hashTokenMimo, numeroConectadoMimo } from "./mimo-whatsapp";
import { uazStatus, uazSendText } from "./uazapi.server";
import { processarLembreteMimo } from "./mimo-recuperacao-processador.server";
import type { CarrinhoRegistro } from "./mimo-carrinhos";
type Config = {
  empresa_id: string;
  loja_id: string;
  vinculo_id: string;
  ator_id: string;
  ativo: boolean;
  inicio_em: string;
};
type Fila = {
  id: string;
  reserva: string;
  checkout_id: string;
  token_hash: string;
  telefone: string;
  empresa_id: string;
  loja_id: string;
};
type Table<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_recuperacao_config: Table<Config>;
      mimo_nuvem_carrinhos: Table<CarrinhoRegistro & { empresa_id: string; loja_id: string }>;
    };
    Functions: Database["public"]["Functions"] & {
      mimo_recuperacao_reservar: { Args: { _empresa: string }; Returns: Fila[] };
      mimo_recuperacao_autorizar: { Args: { _id: string; _reserva: string }; Returns: boolean };
      mimo_recuperacao_concluir: {
        Args: {
          _id: string;
          _reserva: string;
          _estado: string;
          _message_id?: string;
          _motivo?: string;
        };
        Returns: undefined;
      };
    };
  };
};
const db = supabaseAdmin as unknown as SupabaseClient<DB>;
export async function executarRecuperacaoMimo() {
  const ambiente = configOAuthNuvem();
  if (!ambiente) return "sem_configuracao";
  const r = await db
    .from("mimo_recuperacao_config")
    .select("*")
    .eq("empresa_id", ambiente.empresa)
    .eq("ativo", true)
    .maybeSingle();
  if (r.error) throw Error("recuperacao_config_indisponivel");
  const cfg = r.data;
  if (!cfg || cfg.loja_id !== ambiente.loja) return "desativada";
  const nuvem = await obterConfigNuvem(cfg.empresa_id, cfg.ator_id);
  if (!nuvem || nuvem.loja !== cfg.loja_id) throw Error("recuperacao_loja_indisponivel");
  // Só uma sincronização integral bem-sucedida fornece novos candidatos.
  const lote = await coletarNuvem(nuvem);
  const sync = await db.rpc("mimo_nuvem_sincronizar", {
    _empresa: cfg.empresa_id,
    _loja: cfg.loja_id,
    _ator: cfg.ator_id,
    _carrinhos: lote.carrinhos as unknown as Json,
    _pedidos: lote.pedidos as unknown as Json,
  });
  if (sync.error) throw Error("recuperacao_sync_falhou");
  let atual: Fila | null = null;
  let token: string | null = null;
  const concluir = async (
    id: string,
    reserva: string,
    estado: string,
    messageId?: string,
    motivo?: string,
  ) => {
    const resultado = await db.rpc("mimo_recuperacao_concluir", {
      _id: id,
      _reserva: reserva,
      _estado: estado,
      _message_id: messageId,
      _motivo: motivo,
    });
    if (resultado.error) throw Error("recuperacao_resultado_falhou");
  };
  return processarLembreteMimo({
    reservar: async () => {
      const q = await db.rpc("mimo_recuperacao_reservar", { _empresa: cfg.empresa_id });
      if (q.error) throw Error("recuperacao_reserva_falhou");
      atual = q.data?.[0] ?? null;
      return atual;
    },
    preparar: async () => {
      if (!atual) return null;
      const [v, c] = await Promise.all([
        db
          .from("mimo_whatsapp_vinculos")
          .select("*")
          .eq("id", cfg.vinculo_id)
          .eq("empresa_id", cfg.empresa_id)
          .eq("ativo", true)
          .maybeSingle(),
        db
          .from("mimo_nuvem_carrinhos")
          .select("*")
          .eq("empresa_id", cfg.empresa_id)
          .eq("loja_id", cfg.loja_id)
          .eq("checkout_id", atual.checkout_id)
          .maybeSingle(),
      ]);
      if (v.error || c.error) throw Error("recuperacao_contexto_falhou");
      if (
        !v.data ||
        !c.data?.url ||
        c.data.token_hash !== atual.token_hash ||
        numeroConectadoMimo(c.data.telefone) !== atual.telefone
      )
        return null;
      const p = await db
        .from("profiles")
        .select("uazapi_instance_token,wa_provider,wa_method")
        .eq("id", v.data.owner_id)
        .single();
      const t = p.data?.uazapi_instance_token;
      if (
        p.error ||
        !t ||
        p.data?.wa_provider !== "uazapi" ||
        p.data.wa_method !== "qrcode" ||
        (await hashTokenMimo(t)) !== v.data.token_sha256
      )
        return null;
      const [donos, instancias] = await Promise.all([
        db.from("profiles").select("id").eq("uazapi_instance_token", t),
        db.from("uazapi_instancias").select("id,user_id").eq("token", t),
      ]);
      if (donos.error || instancias.error) throw Error("recuperacao_identidade_falhou");
      if (
        donos.data?.length !== 1 ||
        donos.data[0].id !== v.data.owner_id ||
        instancias.data?.some((i) => i.user_id !== v.data!.owner_id) ||
        (v.data.instancia_id && !instancias.data?.some((i) => i.id === v.data!.instancia_id))
      )
        return null;
      const s = await uazStatus(t);
      if (
        s.status !== "connected" ||
        numeroConectadoMimo(s.profileNumber) !== numeroConectadoMimo(v.data.numero_comercial)
      )
        return null;
      token = t;
      return {
        telefone: atual.telefone,
        texto: mensagensRecuperacaoMimo(c.data.nome, c.data.url, nuvem.hosts).whatsapp,
      };
    },
    conferirCompra: async () => {
      if (!atual) throw Error("recuperacao_reserva_ausente");
      return conferirCompraNuvem(nuvem, atual.token_hash);
    },
    autorizar: async (t) => {
      const a = await db.rpc("mimo_recuperacao_autorizar", { _id: t.id, _reserva: t.reserva });
      if (a.error) throw Error("recuperacao_autorizacao_falhou");
      return a.data === true;
    },
    bloquear: (t) => concluir(t.id, t.reserva, "bloqueada", undefined, "compra_ou_destino"),
    enviar: async (d) => {
      if (!token) throw Error("recuperacao_remetente_ausente");
      const s = await uazSendText(token, d.telefone, d.texto);
      return { messageId: s.id ?? null };
    },
    concluir: (t, id) => concluir(t.id, t.reserva, "enviada", id),
    incerto: (t) => concluir(t.id, t.reserva, "incerta", undefined, "aceite_incerto"),
  });
}
