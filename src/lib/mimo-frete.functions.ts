import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assinaturaFrete, CATALOGO, pedidoSchema, produtoSchema } from "./mimo-pedido";
import {
  brindeSchema,
  caixaTipoSchema,
  CAIXAS_PADRAO,
  prepararCaixas,
  prepararDocumento,
} from "./mimo-tira-regras";

export const cotarFreteJadlogMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z.object({ pedido: pedidoSchema, id: z.string().uuid().optional() }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "vendedor", "administrativo"].includes(a.papel))
      throw Error("Acesso negado.");
    const lead = await context.supabase
      .from("mimo_leads")
      .select("id")
      .eq("empresa_id", a.empresaId)
      .eq("id", data.pedido.leadId ?? "")
      .single();
    if (lead.error || !lead.data) throw Error("Cliente indisponível.");
    const { configJadlog, cotarJadlog } = await import("./mimo-jadlog.server");
    const cfg = configJadlog();
    if (!cfg) throw Error("A integração Jadlog ainda precisa ser configurada pela administração.");
    const { tiraClient } = await import("./mimo-pedido-db");
    // A leitura do pedido é feita com a identidade do chamador antes de qualquer acesso privilegiado.
    const original = data.id
      ? await tiraClient(context.supabase)
          .from("mimo_tira_pedidos_seguros")
          .select("documento")
          .eq("empresa_id", a.empresaId)
          .eq("lead_id", lead.data.id)
          .eq("id", data.id)
          .maybeSingle()
      : { data: null, error: null };
    if (original.error) throw Error("Pedido indisponível.");
    const anterior = original.data ? pedidoSchema.parse(original.data.documento) : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const c = await tiraClient(supabaseAdmin)
      .from("mimo_tira_config")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .maybeSingle();
    if (c.error) throw Error("Não foi possível validar o catálogo para cotar o frete.");
    const canonical = prepararDocumento(
      data.pedido,
      a.papel,
      c.data ? z.array(produtoSchema).parse(c.data.catalogo) : CATALOGO,
      c.data ? z.array(brindeSchema).parse(c.data.brindes) : [],
      c.data
        ? z.array(z.number().int().min(0).max(9999)).length(12).parse(c.data.taxas)
        : [313, 368, 368, 368, 368, 368, 589, 589, 589, 589, 589, 589],
      anterior,
    );
    const pedido = prepararCaixas(
      canonical,
      c.data ? z.array(caixaTipoSchema).parse(c.data.caixas) : CAIXAS_PADRAO,
      anterior,
    );
    if (assinaturaFrete(pedido) !== assinaturaFrete(data.pedido))
      throw Error("O catálogo ou as caixas mudaram. Reabra o pedido antes de calcular o frete.");
    return { cotacoes: await cotarJadlog(pedido, cfg, a.empresaId, context.userId) };
  });

export const ultimaEntregaClienteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ leadId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "vendedor", "administrativo"].includes(a.papel))
      throw Error("Acesso negado.");
    const lead = await context.supabase
      .from("mimo_leads")
      .select("id")
      .eq("empresa_id", a.empresaId)
      .eq("id", data.leadId)
      .single();
    if (lead.error || !lead.data) throw Error("Cliente indisponível.");
    const { tiraClient } = await import("./mimo-pedido-db");
    const r = await tiraClient(context.supabase)
      .from("mimo_tira_pedidos_seguros")
      .select("documento")
      .eq("empresa_id", a.empresaId)
      .eq("lead_id", data.leadId)
      .neq("status", "cancelado")
      .neq("documento->>destinoCep", "")
      .neq("documento->>endereco", "")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (r.error) throw Error("Não foi possível recuperar o endereço anterior.");
    if (!r.data) return null;
    const p = pedidoSchema.parse(r.data.documento);
    return { leadId: data.leadId, destinoCep: p.destinoCep, endereco: p.endereco };
  });
