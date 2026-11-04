import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const prepararChaveRascunhoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({ leadId: z.string().uuid().nullable(), pedidoRef: z.string().uuid().nullable() })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "vendedor", "administrativo"].includes(a.papel))
      throw Error("Acesso negado.");
    if (data.leadId) {
      const lead = await context.supabase
        .from("mimo_leads")
        .select("id")
        .eq("empresa_id", a.empresaId)
        .eq("id", data.leadId)
        .single();
      if (lead.error || !lead.data)
        throw Error("O cliente deste rascunho não está mais disponível para você.");
    }
    if (data.pedidoRef) {
      const { tiraClient } = await import("./mimo-pedido-db");
      const p = await tiraClient(context.supabase)
        .from("mimo_tira_pedidos_seguros")
        .select("lead_id")
        .eq("empresa_id", a.empresaId)
        .eq("id", data.pedidoRef)
        .single();
      if (p.error || !p.data || p.data.lead_id !== data.leadId) throw Error("Pedido indisponível.");
    }
    const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base) throw Error("O salvamento automático está indisponível.");
    const { createHmac } = await import("node:crypto");
    const chave = createHmac("sha256", base)
      .update(
        JSON.stringify({
          uso: "mimo-rascunho-1",
          empresa: a.empresaId,
          usuario: context.userId,
          papel: a.papel,
          lead: data.leadId,
          pedido: data.pedidoRef,
        }),
      )
      .digest("base64");
    return { chave, empresaId: a.empresaId, usuarioId: context.userId, papel: a.papel };
  });
