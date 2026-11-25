import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PedidoSalvo } from "./mimo-pedido";
import { comercialV2 } from "./mimo-comercial-v2-db";

export type ContextoPedido = { origemLead: string | null; responsavelNome: string | null };

// Only enrich the already authorized page, always through the caller-scoped client.
export async function contextoDosPedidos(
  db: SupabaseClient<Database>,
  acesso: { empresaId: string; usuarioId: string; papel: string },
  pedidos: PedidoSalvo[],
): Promise<Record<string, ContextoPedido>> {
  if (!pedidos.length) return {};
  const { data: leads, error } = await db
    .from("mimo_leads")
    .select("id,origem")
    .eq("empresa_id", acesso.empresaId)
    .in("id", [...new Set(pedidos.map((p) => p.lead_id))]);
  if (error) throw Error("Não foi possível carregar a origem dos pedidos. Tente novamente.");
  const equipe = ["administrador", "gestor", "vendedor"].includes(acesso.papel)
    ? await comercialV2(db).rpc("mimo_comercial_responsaveis", { _empresa: acesso.empresaId })
    : null;
  if (equipe?.error && !["42883", "PGRST202"].includes(equipe.error.code))
    throw Error("Não foi possível carregar os responsáveis dos pedidos. Tente novamente.");
  const origens = new Map((leads ?? []).map((l) => [l.id, l.origem]));
  const nomes = new Map((equipe?.data ?? []).map((m) => [m.user_id, m.nome]));
  return Object.fromEntries(
    pedidos.map((p) => [
      p.id,
      {
        origemLead: origens.get(p.lead_id) ?? null,
        responsavelNome: p.documento.responsavelId
          ? (nomes.get(p.documento.responsavelId) ??
            (p.documento.responsavelId === acesso.usuarioId
              ? "Você"
              : "Responsável não disponível"))
          : null,
      },
    ]),
  );
}
