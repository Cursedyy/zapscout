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
    lerPaginasComerciais((inicio, fim) =>
      db
        .from("mimo_meta_ads_metricas")
        .select(
          "id,empresa_id,chave,campanha_id,conjunto_id,anuncio_id,campanha,conjunto,anuncio,data_inicio,data_fim,investimento,leads_meta",
          { count: "exact" },
        )
        .eq("empresa_id", acesso.empresaId)
        .lte("data_inicio", data.fim)
        .gte("data_fim", data.inicio)
        .order("id")
        .range(inicio, fim),
    ),
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
    meta as MetaRetorno[],
    leads,
    pedidos,
    eventos as EventoRetorno[],
  );
}

async function carregarPedidos(
  db: SupabaseClient<Database>,
  acesso: Acesso,
  de: string,
  ate: string,
): Promise<PedidoRetorno[] | null> {
  if (acesso.papel === "marketing") return null;
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
