import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { FiltroDashboard } from "./mimo-dashboard";
import {
  calcularRetornoCampanhas,
  type EventoRetorno,
  type LeadRetorno,
  type MetaRetorno,
  type PedidoRetorno,
} from "./mimo-retorno-campanhas";
import type {
  CodigoRetorno,
  DadosCodigosRetorno,
  InvestimentoManualRetorno,
  VinculoMetaRetorno,
} from "./mimo-campanhas-codigos";
import { codigosDb, faltaMigracaoCodigos } from "./mimo-campanhas-codigos-db";
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
  const [meta, leads, eventos, pedidos, codigos] = await Promise.all([
    carregarMetricasMeta(db, acesso.empresaId, data),
    carregarLeads(leadsDb, acesso.empresaId, de, ate),
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
    carregarCodigos(db, acesso.empresaId, data),
  ]);
  return calcularRetornoCampanhas(
    acesso.empresaId,
    { inicio: data.inicio, fim: data.fim },
    meta.linhas,
    leads.linhas,
    pedidos,
    eventos as EventoRetorno[],
    // Códigos só valem quando cadastro e coluna do lead existem; senão a seção fica indisponível.
    codigos && leads.comCodigo ? { ...codigos, metaComIds: meta.comIds } : null,
  );
}

const CAMPOS_META = "id,empresa_id,chave,campanha,conjunto,anuncio,data_inicio,data_fim,investimento,leads_meta";
const CAMPOS_META_COM_IDS = `${CAMPOS_META},campanha_id,conjunto_id,anuncio_id` as const;

async function carregarMetricasMeta(db: SupabaseClient<Database>, empresaId: string, periodo: FiltroDashboard) {
  let usarIds = true;
  const linhas = await lerPaginasComerciais<MetaRetorno>(async (inicio, fim) => {
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
  return { linhas, comIds: usarIds };
}

const CAMPOS_LEAD = "id,empresa_id,entrada_em";
const CAMPOS_LEAD_COM_CODIGO = `${CAMPOS_LEAD},campanha_codigo_id,campanha_codigo_origem`;

/** Lê o código do lead quando a coluna existe; antes da migração segue só com a coorte. */
async function carregarLeads(leadsDb: SupabaseClient<Database>, empresaId: string, de: string, ate: string) {
  let comCodigo = true;
  const linhas = await lerPaginasComerciais<LeadRetorno>(async (inicio, fim) => {
    const pagina = (campos: string) =>
      codigosDb(leadsDb).from("mimo_leads").select(campos, { count: "exact" })
        .eq("empresa_id", empresaId).gte("entrada_em", de).lte("entrada_em", ate)
        .order("id").range(inicio, fim)
        .overrideTypes<LeadRetorno[], { merge: false }>();
    if (comCodigo) {
      const atual = await pagina(CAMPOS_LEAD_COM_CODIGO);
      if (!faltaMigracaoCodigos(atual.error)) return atual;
      comCodigo = false;
    }
    return pagina(CAMPOS_LEAD);
  });
  return { linhas, comCodigo };
}

type Pagina<T> = { data: T[] | null; count: number | null; error: { code?: string; message?: string } | null };

/** Cadastro de códigos, vínculos Meta e investimento manual. null = migração ainda não aplicada. */
async function carregarCodigos(
  db: SupabaseClient<Database>,
  empresaId: string,
  periodo: FiltroDashboard,
): Promise<Omit<DadosCodigosRetorno, "metaComIds"> | null> {
  const c = codigosDb(db);
  let ausente = false;
  const ler = <T,>(buscar: (inicio: number, fim: number) => PromiseLike<Pagina<T>>) =>
    lerPaginasComerciais<T>(async (inicio, fim) => {
      if (ausente) return { data: [], count: 0, error: null };
      const r = await buscar(inicio, fim);
      if (faltaMigracaoCodigos(r.error)) {
        ausente = true;
        return { data: [], count: 0, error: null };
      }
      return r;
    });
  const [codigos, vinculos, investimentos] = await Promise.all([
    ler<CodigoRetorno>((inicio, fim) =>
      c.from("mimo_campanhas_codigos").select("id,empresa_id,codigo,nome,ativo", { count: "exact" })
        .eq("empresa_id", empresaId).order("id").range(inicio, fim)),
    ler<VinculoMetaRetorno>((inicio, fim) =>
      c.from("mimo_campanhas_codigos_meta").select("empresa_id,codigo_id,campanha_id", { count: "exact" })
        .eq("empresa_id", empresaId).order("campanha_id").range(inicio, fim)),
    ler<InvestimentoManualRetorno>((inicio, fim) =>
      c.from("mimo_campanhas_codigos_investimentos")
        .select("id,empresa_id,codigo_id,competencia,valor_centavos,anulado_em", { count: "exact" })
        .eq("empresa_id", empresaId).is("anulado_em", null)
        .gte("competencia", periodo.inicio).lte("competencia", periodo.fim)
        .order("id").range(inicio, fim)),
  ]);
  if (ausente) return null;
  return {
    codigos,
    vinculos,
    investimentos: investimentos.map(i => ({ ...i, valor_centavos: Number(i.valor_centavos) })),
  };
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
