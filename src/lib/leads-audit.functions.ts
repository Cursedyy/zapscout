/**
 * Leitura do log de auditoria de mudanças automáticas de status dos leads.
 * A tabela é escrita apenas pelo servidor (cron / IA) via `logLeadStatusChange`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LeadAuditRow = {
  id: string;
  lead_id: string;
  status_anterior: string | null;
  status_novo: string;
  origem: string;
  detalhes: unknown;
  created_at: string;
  lead_nome: string | null;
};

const listarSchema = z.object({
  leadId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listarAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof listarSchema>) => listarSchema.parse(input))
  .handler(async ({ data, context }): Promise<LeadAuditRow[]> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("leads_status_audit" as never)
      .select("id, lead_id, status_anterior, status_novo, origem, detalhes, created_at, leads:lead_id(nome_empresa)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows as unknown as Array<{
      id: string;
      lead_id: string;
      status_anterior: string | null;
      status_novo: string;
      origem: string;
      detalhes: Record<string, unknown> | null;
      created_at: string;
      leads: { nome_empresa: string | null } | null;
    }>) ?? []).map((r) => ({
      id: r.id,
      lead_id: r.lead_id,
      status_anterior: r.status_anterior,
      status_novo: r.status_novo,
      origem: r.origem,
      detalhes: r.detalhes,
      created_at: r.created_at,
      lead_nome: r.leads?.nome_empresa ?? null,
    }));
  });
