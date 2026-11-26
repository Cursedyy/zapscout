import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { FiltroDashboard } from "./mimo-dashboard";
import {
  calcularRetornoCampanhas,
  type EventoRetorno,
  type MetaRetorno,
  type PedidoRetorno,
} from "./mimo-retorno-campanhas";
import { lerPaginasComerciais } from "./mimo-comercial-paginacao";

type Acesso = { empresaId: string; papel: string };
export async function carregarRetornoCampanhas(
  db: SupabaseClient<Database>,
  leadsDb: SupabaseClient<Database>,
  acesso: Acesso,
  data: FiltroDashboard,
  de: string,
  ate: string,
) {
  const [meta, leads, eventos, pedidos] = await Promise.all([
    carregarMetricasMeta(db, acesso.empresaId, data),
    lerPaginasComerciais((inicio, fim) =>
      leadsDb
        .from("mimo_leads")
        .select("id,empresa_id,entrada_em", { count: "exact" })
        .eq("empresa_id", acesso.empresaId)
        .gte("entrada_em", de)
        .lte("entrada_em", ate)
        .order("id")
        .range(inicio, fim),
    ),
    lerPaginasComerciais((inicio, fim) =>
      db
        .from("mimo_whatsapp_eventos")
        .select("id,empresa_id,lead_id,direcao,contato_em,referencia_anuncio", { count: "exact" })
        .eq("empresa_id", acesso.empresaId)
        .eq("direcao", "recebida")
        .gte("contato_em", de)
        .lte("contato_em", ate)
        .not("lead_id", "is", null)
        .not("referencia_anuncio", "is", null)
        .order("id")
        .range(inicio, fim),
    ),
    carregarPedidos(db, acesso, de, ate),
  ]);
  return calcularRetornoCampanhas(
    acesso.empresaId,
    { inicio: data.inicio, fim: data.fim },
    meta,
    leads,
    pedidos,
    eventos as EventoRetorno[],
  );
}

const CAMPOS_META = "id,empresa_id,chave,campanha,conjunto,anuncio,data_inicio,data_fim,investimento,leads_meta";
const CAMPOS_META_COM_IDS = `${CAMPOS_META},campanha_id,conjunto_id,anuncio_id` as const;

async function carregarMetricasMeta(db: SupabaseClient<Database>, empresaId: string, periodo: FiltroDashboard) {
  let usarIds = true;
  return lerPaginasComerciais<MetaRetorno>(async (inicio, fim) => {
    function pagina<C extends typeof CAMPOS_META | typeof CAMPOS_META_COM_IDS>(campos: C) {
      return db.from("mimo_meta_ads_metricas").select(campos, { count: "exact" })
        .eq("empresa_id", empresaId).lte("data_inicio", periodo.fim).gte("data_fim", periodo.inicio)
        .order("id").range(inicio, fim);
    }

    if (usarIds) {
      const atual = await pagina(CAMPOS_META_COM_IDS).overrideTypes<MetaRetorno[], { merge: false }>();
      const erro = atual.error;
      if (!erro || !["42703", "PGRST204"].includes(erro.code) ||
          !/\b(?:campanha_id|conjunto_id|anuncio_id)\b/i.test(erro.message)) return atual;
      usarIds = false;
    }

    const legado = await pagina(CAMPOS_META);
    return {
      ...legado,
      data: legado.data?.map(linha => ({ ...linha, campanha_id: "", conjunto_id: "", anuncio_id: "" })) ?? null,
    };
  });
}

async function carregarPedidos(
  db: SupabaseClient<Database>,
  acesso: Acesso,
  de: string,
  ate: string,
): Promise<PedidoRetorno[] | null> {
  if ((acesso.papel === "marketing" || acesso.papel === "lider_marketing")) return null;
  const { capacidadeComercial } = await import("./mimo-comercial-v2.server");
  if (!(await capacidadeComercial(db, acesso.empresaId))) return null;
  const { comercialV2 } = await import("./mimo-comercial-v2-db");
  return lerPaginasComerciais((inicio, fim) =>
    comercialV2(db)
      .from("mimo_pedidos_conversao")
      .select("id,empresa_id,lead_id,status,total,primeira_confirmacao", { count: "exact" })
      .eq("empresa_id", acesso.empresaId)
      .gte("primeira_confirmacao", de)
      .lte("primeira_confirmacao", ate)
      .order("id")
      .range(inicio, fim),
  );
}
