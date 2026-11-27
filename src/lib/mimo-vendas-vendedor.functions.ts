import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { vendasPorVendedor } from "./mimo-vendas-vendedor";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const PAPEIS_VENDAS_VENDEDOR = ["administrador", "gestor", "administrativo"] as const;

/** Sales per responsible member for management and billing. Orders are read through the
 * caller-scoped safe view (RLS decides visibility); only totals, status and owner are used. */
export const vendasPorVendedorMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z
      .object({ inicio: dataIso, fim: dataIso })
      .refine((p) => p.inicio <= p.fim, "Período inválido.")
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!(PAPEIS_VENDAS_VENDEDOR as readonly string[]).includes(a.papel)) throw Error("Acesso negado.");
    const { tiraClient } = await import("./mimo-pedido-db");
    const db = tiraClient(context.supabase);
    const pedidos: { total: number; status: string; responsavelId: string | null }[] = [];
    for (let de = 0; de < 10000; de += 1000) {
      const r = await db
        .from("mimo_tira_pedidos_seguros")
        .select(
          "id,total,status,responsavel:documento->>responsavelId,responsavelPedido:documento->>responsavelPedidoId",
        )
        .eq("empresa_id", a.empresaId)
        .gte("created_at", `${data.inicio}T00:00:00-03:00`)
        .lte("created_at", `${data.fim}T23:59:59.999-03:00`)
        .order("id", { ascending: true })
        .range(de, de + 999);
      if (r.error) throw Error("Não foi possível carregar as vendas.");
      const linhas = (r.data ?? []) as unknown as {
        total: number | null;
        status: string;
        responsavel: string | null;
        responsavelPedido: string | null;
      }[];
      for (const p of linhas)
        pedidos.push({ total: Number(p.total ?? 0), status: p.status, responsavelId: p.responsavelPedido || p.responsavel || null });
      if (linhas.length < 1000) break;
    }
    const { nomesResponsaveis } = await import("./mimo-pedidos-contexto.server");
    const nomes = await nomesResponsaveis(context.supabase, { empresaId: a.empresaId, papel: a.papel });
    if (nomes.has(context.userId)) nomes.set(context.userId, `${nomes.get(context.userId)} (você)`);
    return { linhas: vendasPorVendedor(pedidos, nomes) };
  });
