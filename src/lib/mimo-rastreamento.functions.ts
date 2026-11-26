import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pedidoSchema, type PedidoSalvo, type Recebimento } from "./mimo-pedido";
import { tiraClient } from "./mimo-pedido-db";
import { filtrarEntregas, filtroRastreamentoSchema } from "./mimo-rastreamento";
import type { Json } from "@/integrations/supabase/types";

const TAMANHO_LOTE = 500;
const LIMITE_SEGURO = 20_000;

type LinhaPedido = {
  id: string;
  empresa_id: string;
  lead_id: string;
  numero: number;
  versao: number;
  documento: Json;
  pix: Json;
  recebimentos: Json;
  total: number;
  produtos: number;
  frete: number;
  status: string;
  created_at: string;
  updated_at: string;
};

function mapear(linha: LinhaPedido): PedidoSalvo {
  const documento = pedidoSchema.parse(linha.documento);
  return {
    ...linha,
    documento,
    status: documento.status,
    pix: linha.pix as Recebimento,
    recebimentos: linha.recebimentos as Recebimento[],
  } as PedidoSalvo;
}

export const listarRastreamentoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((valor) => filtroRastreamentoSchema.parse(valor))
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if ((acesso.papel === "marketing" || acesso.papel === "lider_marketing")) throw new Error("Acesso negado.");
    const { tiraPersistenciaAtiva } = await import("./mimo-tira.server");
    if (!tiraPersistenciaAtiva()) return { disponivel: false, itens: [], total: 0 };

    const db = tiraClient(context.supabase);
    const pedidos: PedidoSalvo[] = [];
    for (let inicio = 0; inicio < LIMITE_SEGURO; inicio += TAMANHO_LOTE) {
      let consulta = db
        .from("mimo_tira_pedidos_seguros")
        .select("*")
        .eq("empresa_id", acesso.empresaId)
        .in("status", data.status ? [data.status] : ["faturado", "enviado", "entregue"]);
      if (data.inicio) consulta = consulta.gte("updated_at", `${data.inicio}T00:00:00-03:00`);
      if (data.fim) consulta = consulta.lte("updated_at", `${data.fim}T23:59:59.999-03:00`);
      const resposta = await consulta
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(inicio, inicio + TAMANHO_LOTE - 1);
      if (resposta.error) throw new Error("Não foi possível carregar as entregas.");
      const lote = (resposta.data ?? []) as LinhaPedido[];
      pedidos.push(...lote.map(mapear));
      if (lote.length < TAMANHO_LOTE) break;
      if (inicio + TAMANHO_LOTE >= LIMITE_SEGURO) {
        throw new Error("Há muitas entregas para uma consulta segura. Reduza o período.");
      }
    }

    const encontradas = filtrarEntregas(pedidos, data.busca);
    const de = (data.pagina - 1) * data.porPagina;
    return {
      disponivel: true,
      itens: encontradas.slice(de, de + data.porPagina),
      total: encontradas.length,
    };
  });
