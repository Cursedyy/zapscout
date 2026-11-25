import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calcularRetornoCampanhas,
  filtroRetornoSchema,
  type PedidoRetorno,
} from "./mimo-retorno-campanhas";
import { limitesPeriodo } from "./mimo-dashboard";
import { lerPaginasComerciais } from "./mimo-comercial-paginacao";

export const retornoCampanhasMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(filtroRetornoSchema)
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "marketing"].includes(acesso.papel))
      throw Error("Acesso negado.");
    const { de, ate } = limitesPeriodo(data);
    // Same restricted aggregate read as the existing dashboard: no names, phones,
    // fiscal documents or raw lead/order rows are ever returned to marketing.
    const leadsDb =
      acesso.papel === "marketing"
        ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
        : context.supabase;
    const [meta, leads, pedidos] = await Promise.all([
      lerPaginasComerciais((inicio, fim) =>
        context.supabase
          .from("mimo_meta_ads_metricas")
          .select(
            "id,empresa_id,chave,campanha,conjunto,anuncio,data_inicio,data_fim,investimento,leads_meta",
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
      (async (): Promise<PedidoRetorno[] | null> => {
        if (acesso.papel === "marketing") return null;
        const { capacidadeComercial } = await import("./mimo-comercial-v2.server");
        if (!(await capacidadeComercial(context.supabase, acesso.empresaId))) return null;
        const { comercialV2 } = await import("./mimo-comercial-v2-db");
        return lerPaginasComerciais((inicio, fim) =>
          comercialV2(context.supabase)
            .from("mimo_pedidos_conversao")
            .select("id,empresa_id,lead_id,status,total,primeira_confirmacao", { count: "exact" })
            .eq("empresa_id", acesso.empresaId)
            .gte("primeira_confirmacao", de)
            .lte("primeira_confirmacao", ate)
            .order("id")
            .range(inicio, fim),
        );
      })(),
    ]);
    return calcularRetornoCampanhas(acesso.empresaId, data, meta, leads, pedidos);
  });
