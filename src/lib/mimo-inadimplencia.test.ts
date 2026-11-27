import { describe, expect, it } from "vitest";
import {
  calcularInadimplencia,
  classificarStatus,
  csvInadimplencia,
  dataOmieParaIso,
  faixaAtraso,
  hojeSaoPaulo,
  normalizarTitulos,
  percentual,
  periodoInadimplenciaSchema,
  periodoPadrao,
  type ResultadoInadimplencia,
} from "./mimo-inadimplencia";
import { PAPEIS_MIMO, podeAbrirPagina } from "./mimo-acesso";
import { HOJE_FIXTURE, PERIODO_FIXTURE, titulosSinteticos } from "./mimo-inadimplencia.fixtures";

function calcular() {
  const n = normalizarTitulos(titulosSinteticos());
  return { ...n, r: calcularInadimplencia(n.titulos, PERIODO_FIXTURE, HOJE_FIXTURE) };
}

describe("normalização de títulos do Omie", () => {
  it("aceita campos extras, códigos numéricos em texto e converte para centavos inteiros", () => {
    const { titulos, invalidos, duplicados } = calcular();
    expect(invalidos).toBe(1);
    expect(duplicados).toBe(1);
    expect(titulos).toHaveLength(14);
    const t = titulos.find((x) => x.cliente === 20 && x.vencimento === "2026-11-11")!;
    expect(t.valor).toBe(20010);
    expect(titulos.find((x) => x.vencimento === "2026-08-29")!.valor).toBe(3030);
    expect(titulos.filter((x) => x.vendedor === 5)).toHaveLength(3);
    expect(titulos.find((x) => x.vencimento === "2026-08-29")!.vendedor).toBeNull();
  });
  it("recusa datas inexistentes ou em outro formato", () => {
    expect(dataOmieParaIso("31/02/2026")).toBeNull();
    expect(dataOmieParaIso("2026-02-01")).toBeNull();
    expect(dataOmieParaIso("01/02/2026")).toBe("2026-02-01");
  });
  it("recusa valores negativos ou ausentes", () => {
    const r = normalizarTitulos([
      {
        codigo_lancamento_omie: 1,
        codigo_cliente_fornecedor: 1,
        data_vencimento: "01/01/2026",
        valor_documento: -1,
        status_titulo: "ATRASADO",
      },
      {
        codigo_lancamento_omie: 2,
        codigo_cliente_fornecedor: 1,
        data_vencimento: "01/01/2026",
        status_titulo: "ATRASADO",
      },
    ]);
    expect(r.titulos).toHaveLength(0);
    expect(r.invalidos).toBe(2);
  });
  it("classifica status do Omie sem adivinhar status desconhecidos", () => {
    expect(classificarStatus("Recebido")).toBe("recebido");
    expect(classificarStatus("vence_hoje")).toBe("aberto");
    expect(classificarStatus("A  VENCER")).toBe("aberto");
    expect(classificarStatus("CANCELADO")).toBe("cancelado");
    expect(classificarStatus("PARCIAL")).toBe("desconhecido");
  });
});

describe("cálculo da inadimplência", () => {
  it("calcula índices por valor e por quantidade sobre a base vencida", () => {
    const { r } = calcular();
    expect(r.vencidoAberto).toEqual({ quantidade: 7, valor: 141040 });
    expect(r.baseVencida).toEqual({ quantidade: 8, valor: 191040 });
    expect(r.indiceValor).toBe(73.83);
    expect(r.indiceQuantidade).toBe(87.5);
  });
  it("separa recebido, a vencer (inclui vence hoje), cancelados e status desconhecidos", () => {
    const { r } = calcular();
    expect(r.recebido).toEqual({ quantidade: 2, valor: 56000 });
    expect(r.aVencer).toEqual({ quantidade: 2, valor: 15000 });
    expect(r.total).toEqual({ quantidade: 11, valor: 212040 });
    expect(r.cancelados).toEqual({ quantidade: 1, valor: 99900 });
    expect(r.naoClassificados).toEqual({ quantidade: 1, valor: 4000 });
    expect(r.statusDesconhecidos).toEqual(["PARCIAL"]);
    expect(r.foraDoPeriodo).toBe(1);
  });
  it("distribui o vencido em aberto nas faixas de atraso", () => {
    const { r } = calcular();
    expect(r.faixas.map((f) => [f.id, f.quantidade, f.valor])).toEqual([
      ["1-15", 2, 15000],
      ["16-30", 2, 21010],
      ["31-60", 1, 2000],
      ["61-90", 1, 3030],
      ["90+", 1, 100000],
    ]);
    expect(r.faixas.reduce((s, f) => s + f.valor, 0)).toBe(r.vencidoAberto.valor);
  });
  it("respeita os limites das faixas", () => {
    expect([1, 15, 16, 30, 31, 60, 61, 90, 91, 400].map(faixaAtraso)).toEqual([
      "1-15",
      "1-15",
      "16-30",
      "16-30",
      "31-60",
      "31-60",
      "61-90",
      "61-90",
      "90+",
      "90+",
    ]);
    expect(() => faixaAtraso(0)).toThrow();
  });
  it("ordena clientes pelo valor vencido em aberto", () => {
    const { r } = calcular();
    expect(r.clientes.map((c) => [c.cliente, c.valor, c.quantidade, c.maiorAtraso])).toEqual([
      [30, 101000, 2, 91],
      [20, 23040, 2, 90],
      [10, 15000, 2, 15],
      [40, 2000, 1, 31],
    ]);
    expect(r.clientes[0].vencimentoMaisAntigo).toBe("2026-08-28");
  });
  it("detalha por vendedor, incluindo títulos sem vendedor", () => {
    const { r } = calcular();
    expect(
      r.vendedores.map((v) => [v.vendedor, v.vencidoValor, v.emAbertoValor, v.indiceValor]),
    ).toEqual([
      [6, 100000, 100000, 100],
      [null, 26040, 26040, 100],
      [5, 65000, 15000, 23.08],
    ]);
  });
  it("não inventa índice quando não há títulos vencidos", () => {
    const r = calcularInadimplencia([], PERIODO_FIXTURE, HOJE_FIXTURE);
    expect(r.indiceValor).toBeNull();
    expect(r.indiceQuantidade).toBeNull();
    expect(percentual(1, 0)).toBeNull();
  });
});

describe("datas e período (São Paulo)", () => {
  it("usa a data de São Paulo, não a do servidor", () => {
    expect(hojeSaoPaulo(new Date("2026-11-28T02:59:00Z"))).toBe("2026-11-27");
    expect(hojeSaoPaulo(new Date("2026-11-28T03:00:00Z"))).toBe("2026-11-28");
  });
  it("valida o período", () => {
    expect(
      periodoInadimplenciaSchema.safeParse({ de: "2026-02-01", ate: "2026-01-01" }).success,
    ).toBe(false);
    expect(
      periodoInadimplenciaSchema.safeParse({ de: "2025-01-01", ate: "2026-12-31" }).success,
    ).toBe(false);
    expect(
      periodoInadimplenciaSchema.safeParse({ de: "2026-02-30", ate: "2026-03-01" }).success,
    ).toBe(false);
    expect(periodoInadimplenciaSchema.safeParse({ ...PERIODO_FIXTURE, extra: 1 }).success).toBe(
      false,
    );
    expect(periodoInadimplenciaSchema.safeParse(PERIODO_FIXTURE).success).toBe(true);
  });
  it("período padrão cobre 12 meses até hoje e é válido", () => {
    const p = periodoPadrao(new Date("2026-11-27T15:00:00Z"));
    expect(p).toEqual({ de: "2025-12-01", ate: "2026-11-27" });
    expect(periodoInadimplenciaSchema.safeParse(p).success).toBe(true);
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas e escreve valores sem ponto flutuante", () => {
    const { r } = calcular();
    r.clientes[0].nome = '=HYPERLINK("http://x")';
    r.clientes[1].nome = "+55 Cliente";
    const resultado: ResultadoInadimplencia = {
      ...r,
      geradoEm: "2026-11-27T15:00:00.000Z",
      titulosLidos: 16,
      invalidos: 1,
      duplicados: 1,
      avisos: [],
    };
    const csv = csvInadimplencia(resultado);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")";30;1010,00;2;91;28/08/2026`);
    expect(csv).toContain("'+55 Cliente;20;230,40");
    expect(csv).toContain("Cliente Omie 10;10;150,00");
    expect(csv).toContain("Índice de inadimplência (valor) %;73,83;");
    expect(csv).toContain("Sem vendedor informado;;260,40;260,40;4;100");
    expect(csv).not.toMatch(/\r\n=|;=|;\+|;-|;@/);
  });
});

describe("acesso", () => {
  it.each(PAPEIS_MIMO)("menu de inadimplência para %s", (papel) => {
    expect(podeAbrirPagina(papel, "/mimo/inadimplencia")).toBe(
      ["administrador", "gestor"].includes(papel),
    );
  });
});
