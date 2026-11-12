import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Pedido } from "./mimo-pedido";
import { assinaturaFrete, CATALOGO, pedidoSchema, produtoSchema } from "./mimo-pedido";
import {
  brindeSchema,
  caixaTipoSchema,
  CAIXAS_PADRAO,
  prepararCaixas,
  prepararDocumento,
} from "./mimo-tira-regras";

async function prepararPedidoParaFrete(
  context: { supabase: SupabaseClient<Database>; userId: string },
  data: { pedido: Pedido; id?: string },
) {
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
  if (original.error || (data.id && !original.data)) throw Error("Pedido indisponível.");
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
  return { pedido, acesso: a };
}
const entradaFrete = (v: unknown) =>
  z.object({ pedido: pedidoSchema, id: z.string().uuid().optional() }).strict().parse(v);

export const cotarFreteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entradaFrete)
  .handler(async ({ data, context }) => {
    const { pedido, acesso } = await prepararPedidoParaFrete(context, data);
    const { configFrenet, cotarFrenet } = await import("./mimo-frenet.server");
    const frenet = configFrenet();
    if (frenet)
      return {
        cotacoes: await cotarFrenet(pedido, frenet, acesso.empresaId, context.userId),
        provedor: "frenet" as const,
      };
    const { configJadlog, cotarJadlog } = await import("./mimo-jadlog.server");
    const cfg = configJadlog();
    if (!cfg)
      throw Error(
        "O servi\u00e7o de cota\u00e7\u00e3o est\u00e1 temporariamente indispon\u00edvel.",
      );
    return {
      cotacoes: await cotarJadlog(pedido, cfg, acesso.empresaId, context.userId),
      provedor: "jadlog" as const,
    };
  });

// Kept for existing clients during publication of the multi-carrier flow.
export const cotarFreteJadlogMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entradaFrete)
  .handler(async ({ data, context }) => {
    const { pedido, acesso } = await prepararPedidoParaFrete(context, data);
    const { configJadlog, cotarJadlog } = await import("./mimo-jadlog.server");
    const cfg = configJadlog();
    if (!cfg)
      throw Error(
        "O servi\u00e7o de cota\u00e7\u00e3o est\u00e1 temporariamente indispon\u00edvel.",
      );
    return { cotacoes: await cotarJadlog(pedido, cfg, acesso.empresaId, context.userId) };
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
