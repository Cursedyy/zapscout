import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { responsavelDoPedido, type PedidoSalvo } from "./mimo-pedido";
import { comercialV2 } from "./mimo-comercial-v2-db";

export type ContextoPedido = { origemLead: string | null; responsavelNome: string | null };

/** Names of the members who can own orders (administrador, gestor, vendedor). The billing role
 * (administrativo) sees every order but the shared RPC is commercial-only, so after the caller's
 * active membership is verified the server reads just these names with the service client. */
export async function nomesResponsaveis(
  db: SupabaseClient<Database>,
  acesso: { empresaId: string; papel: string },
): Promise<Map<string, string>> {
  if (["administrador", "gestor", "vendedor"].includes(acesso.papel)) {
    const equipe = await comercialV2(db).rpc("mimo_comercial_responsaveis", { _empresa: acesso.empresaId });
    if (equipe.error && !["42883", "PGRST202"].includes(equipe.error.code))
      throw Error("Não foi possível carregar os responsáveis dos pedidos. Tente novamente.");
    return new Map((equipe.data ?? []).map((m) => [m.user_id, m.nome]));
  }
  if (acesso.papel !== "administrativo") return new Map();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const membros = await supabaseAdmin
    .from("empresa_membros")
    .select("user_id")
    .eq("empresa_id", acesso.empresaId)
    .eq("ativo", true)
    .in("papel", ["administrador", "gestor", "vendedor"]);
  if (membros.error) throw Error("Não foi possível carregar os responsáveis dos pedidos. Tente novamente.");
  const ids = (membros.data ?? []).map((m) => m.user_id);
  if (!ids.length) return new Map();
  const perfis = await supabaseAdmin.from("profiles").select("id,nome").in("id", ids);
  if (perfis.error) throw Error("Não foi possível carregar os responsáveis dos pedidos. Tente novamente.");
  const nomes = new Map((perfis.data ?? []).map((p) => [p.id, p.nome?.trim() || "Membro comercial"]));
  return new Map(ids.map((id) => [id, nomes.get(id) ?? "Membro comercial"]));
}

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
  const nomes = await nomesResponsaveis(db, acesso);
  const origens = new Map((leads ?? []).map((l) => [l.id, l.origem]));
  return Object.fromEntries(
    pedidos.map((p) => {
      const responsavel = responsavelDoPedido(p.documento);
      return [
        p.id,
        {
          origemLead: origens.get(p.lead_id) ?? null,
          responsavelNome: responsavel
            ? (nomes.get(responsavel) ??
              (responsavel === acesso.usuarioId ? "Você" : "Responsável não disponível"))
            : null,
        },
      ];
    }),
  );
}
