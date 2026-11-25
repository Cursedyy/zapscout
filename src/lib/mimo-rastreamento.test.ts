import { describe, expect, it } from "vitest";
import { CATALOGO, itemDeProduto, novoPedido, type PedidoSalvo } from "./mimo-pedido";
import {
  correspondeBuscaEntrega,
  entregaDoPedido,
  filtroRastreamentoSchema,
  statusEntrega,
} from "./mimo-rastreamento";

function pedido(): PedidoSalvo {
  const documento = {
    ...novoPedido(),
    cliente: "Mercado Sintético",
    status: "enviado" as const,
    itens: [itemDeProduto(CATALOGO[0], 1)],
    cotacaoId: "frete-1",
    cotacoes: [
      {
        id: "frete-1",
        modalidade: "Expresso",
        prazo: "3 dias úteis",
        modo: "remessa" as const,
        valor: 1234,
        valoresVolumes: {},
        assinatura: "assinatura",
        registradaEm: "2026-11-20T12:00:00.000Z",
        oficial: true as const,
        provedor: "frenet" as const,
        transportadora: "Transportadora Sintética",
        servicoCodigo: "EXP-42",
      },
    ],
  };
  return {
    id: "p1",
    numero: 42,
    versao: 1,
    empresa_id: "e1",
    lead_id: "l1",
    documento,
    pix: null,
    recebimentos: [],
    created_at: "2026-11-20T12:00:00Z",
    updated_at: "2026-11-24T12:00:00Z",
    total: 100,
    produtos: 100,
    frete: 0,
    status: "enviado",
  };
}

describe("domínio do rastreamento MiMo", () => {
  it("deriva somente os campos canônicos da cotação selecionada", () => {
    expect(entregaDoPedido(pedido())).toMatchObject({
      numero: 42,
      cliente: "Mercado Sintético",
      status: "enviado",
      transportadora: "Transportadora Sintética",
      codigoServico: "EXP-42",
      prazo: "3 dias úteis",
    });
    expect(
      entregaDoPedido({
        ...pedido(),
        status: "confirmado",
        documento: { ...pedido().documento, status: "confirmado" },
      }),
    ).toBeNull();
  });

  it.each(["42", "mercado", "exp-42"])("busca por pedido, cliente ou código: %s", (busca) => {
    expect(correspondeBuscaEntrega(entregaDoPedido(pedido())!, busca)).toBe(true);
  });

  it("não chama código de serviço de código de rastreio nem inventa estado", () => {
    expect(statusEntrega("faturado")).toBe("Preparando envio");
    expect(statusEntrega("enviado")).toBe("Enviado");
    expect(statusEntrega("entregue")).toBe("Entregue");
    expect(statusEntrega("confirmado")).toBeNull();
  });

  it("valida período e limites", () => {
    expect(
      filtroRastreamentoSchema.safeParse({ inicio: "2026-11-24", fim: "2026-11-01" }).success,
    ).toBe(false);
    expect(filtroRastreamentoSchema.safeParse({ busca: "x".repeat(101) }).success).toBe(false);
  });
});
