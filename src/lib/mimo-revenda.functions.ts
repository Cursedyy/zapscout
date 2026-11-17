import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RevendaDB } from "./mimo-revenda-db";
export const fichasRevenda = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ lead_id: z.string().uuid() }).parse(v)).handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor", "vendedor"].includes(acesso.papel)) throw Error("Acesso negado.");
    const { data: lead, error: erroLead } = await context.supabase.from("mimo_leads").select("id").eq("empresa_id", acesso.empresaId).eq("id", data.lead_id).maybeSingle();
    if (erroLead || !lead) throw Error("Acesso negado.");
    const { data: fichas, error } = await (context.supabase as unknown as SupabaseClient<RevendaDB>).from("mimo_revenda_inscricoes")
      .select("id,empresa_id,lead_id,telefone,respostas,minimo_centavos,created_at").eq("empresa_id", acesso.empresaId).eq("lead_id", data.lead_id).order("created_at", { ascending: false }).limit(20);
    if (error) throw Error("Não foi possível carregar as respostas de revenda.");
    return fichas ?? [];
  });

