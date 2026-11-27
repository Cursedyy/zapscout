import { describe, expect, it } from "vitest";
import { vendasPorVendedor } from "./mimo-vendas-vendedor";

describe("vendas por vendedor", () => {
  const nomes = new Map([["adm", "Matheus"], ["v1", "Ana"]]);
  it("agrupa por responsável, inclui o administrador e ignora rascunhos e cancelados no valor", () => {
    expect(vendasPorVendedor([
      { total: 152307, status: "faturado", responsavelId: "adm" },
      { total: 801529, status: "confirmado", responsavelId: "adm" },
      { total: 164881, status: "entregue", responsavelId: "v1" },
      { total: 50000, status: "cancelado", responsavelId: "v1" },
      { total: 99999, status: "rascunho", responsavelId: "v1" },
      { total: 1000, status: "aguardando_pagamento", responsavelId: null },
      { total: 2000, status: "confirmado", responsavelId: "saiu" },
    ], nomes)).toEqual([
      { responsavelId: "adm", nome: "Matheus", pedidos: 2, valor: 953836, faturado: 152307, cancelados: 0 },
      { responsavelId: "v1", nome: "Ana", pedidos: 1, valor: 164881, faturado: 164881, cancelados: 1 },
      { responsavelId: "saiu", nome: "Membro sem nome", pedidos: 1, valor: 2000, faturado: 0, cancelados: 0 },
      { responsavelId: null, nome: "Sem responsável", pedidos: 1, valor: 1000, faturado: 0, cancelados: 0 },
    ]);
  });
  it("vendedor só com rascunhos não aparece", () => {
    expect(vendasPorVendedor([{ total: 10, status: "rascunho", responsavelId: "v1" }], nomes)).toEqual([]);
  });
});
