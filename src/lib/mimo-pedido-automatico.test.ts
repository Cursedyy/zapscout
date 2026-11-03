import { describe, it, expect } from "vitest";
import { atualizarPedidoAutomatico } from "./mimo-pedido-automatico";
import { CATALOGO, MODELOS, carregarModelo, novoPedido, calcularPedido } from "./mimo-pedido";
describe("preenchimento automático do rascunho", () => {
  it("preenche caixas e valor da mercadoria sem confirmar logística ou pagamento", () => {
    const itens = carregarModelo(MODELOS.find(m => m.nome.includes("Inicial"))!, CATALOGO);
    const p = atualizarPedidoAutomatico(novoPedido(), { itens });
    expect(p.declarado).toBe(calcularPedido(p).produtos); expect(p.declarado).toBeGreaterThan(0);
    expect(p.volumes.length).toBeGreaterThan(0); expect(p.volumes.every(v => !v.confirmado)).toBe(true);
    expect(p.status).toBe("rascunho");
  });
  it("preserva valor fiscal informado e caixas ao ajustar apenas o preço", () => {
    let p = atualizarPedidoAutomatico(novoPedido(), { itens: carregarModelo(MODELOS[0], CATALOGO) });
    p = { ...p, declarado: 12345, declaradoProvisorio: false };
    const q = atualizarPedidoAutomatico(p, { itens: p.itens.map(i => ({ ...i, precoNegociado: i.precoNegociado - 1 })) });
    expect(q.declarado).toBe(12345); expect(q.volumes).toBe(p.volumes); expect(p.itens[0].precoNegociado).not.toBe(q.itens[0].precoNegociado);
  });
  it("recalcula mercadoria e exige nova conferência quando as quantidades mudam", () => {
    const p = atualizarPedidoAutomatico(novoPedido(), { itens: carregarModelo(MODELOS[0], CATALOGO) });
    const q = atualizarPedidoAutomatico(p, { itens: p.itens.map(i => ({ ...i, quantidade: i.quantidade + 1 })) });
    expect(q.declarado).toBeGreaterThan(p.declarado); expect(q.volumes.every(v => !v.confirmado)).toBe(true);
  });
});
