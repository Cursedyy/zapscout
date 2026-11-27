// Client-safe aggregation of Tira-pedido orders by responsible member (seller, manager or admin).
export type PedidoVenda = { total: number; status: string; responsavelId: string | null };
export type LinhaVendasVendedor = {
  responsavelId: string | null;
  nome: string;
  pedidos: number;
  valor: number;
  faturado: number;
  cancelados: number;
};

const FATURADOS = new Set(["faturado", "enviado", "entregue"]);

/** Cancelled orders and drafts never count as sales; billed = faturado, enviado or entregue. */
export function vendasPorVendedor(pedidos: PedidoVenda[], nomes: Map<string, string>): LinhaVendasVendedor[] {
  const linhas = new Map<string, LinhaVendasVendedor>();
  for (const p of pedidos) {
    const chave = p.responsavelId ?? "";
    const l = linhas.get(chave) ?? {
      responsavelId: p.responsavelId,
      nome: p.responsavelId ? (nomes.get(p.responsavelId) ?? "Membro sem nome") : "Sem responsável",
      pedidos: 0,
      valor: 0,
      faturado: 0,
      cancelados: 0,
    };
    if (p.status === "cancelado") l.cancelados++;
    else if (p.status !== "rascunho") {
      l.pedidos++;
      l.valor += p.total;
      if (FATURADOS.has(p.status)) l.faturado += p.total;
    }
    linhas.set(chave, l);
  }
  return [...linhas.values()]
    .filter((l) => l.pedidos || l.cancelados)
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));
}
