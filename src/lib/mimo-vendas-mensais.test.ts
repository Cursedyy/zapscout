import { expect, it } from "vitest";
import { calcularVendasMensais, valorEmCentavos } from "./mimo-vendas-mensais";

const dia = (data: string, realizado: number, feriado = false) => ({ data, realizado, feriado, orcado: 999 });
const registro = {
  competencia: "2025-01-01",
  demonstrativo: { total: { orcado: 10001, realizado: 1 }, semanas: [
    { numero: 1, dias: [dia("2025-01-01", 500, true), dia("2025-01-02", 5200), dia("2025-01-03", 1000), dia("2025-01-04", 300)] },
    { numero: 2, dias: [dia("2025-01-06", 20)] },
  ] },
};

it("distribui cada centavo da meta e inclui as vendas de dias sem orçamento", () => {
  const r = calcularVendasMensais(registro);
  expect(r.diasUteis).toBe(3);
  expect(r.semanas.flatMap(s => s.dias.map(d => d.orcado))).toEqual([0, 3334, 3334, 0, 3333]);
  expect(r.semanas[0].dias[0]).toMatchObject({ coberturaBps: null, diferenca: 500 });
  expect(r.semanas[0].total).toEqual({ orcado: 6668, realizado: 7000, coberturaBps: 10498, diferenca: 332 });
  expect(r.total).toEqual({ orcado: 10001, realizado: 7020, coberturaBps: 7019, diferenca: -2981 });
});

it("recalcula todos os períodos com uma nova meta e aceita zerar um lançamento anterior", () => {
  const r = calcularVendasMensais({ ...registro, ajustes: { meta: 6000, "2025-01-02": 0 } });
  expect(r.semanas[0].total).toEqual({ orcado: 4000, realizado: 1800, coberturaBps: 4500, diferenca: -2200 });
  expect(r.total).toEqual({ orcado: 6000, realizado: 1820, coberturaBps: 3033, diferenca: -4180 });
  expect(calcularVendasMensais({ ...registro, ajustes: { meta: 0 } }).total)
    .toEqual({ orcado: 0, realizado: 7020, coberturaBps: null, diferenca: 7020 });
});

it.each([["0", 0], ["0,01", 1], ["1.234,56", 123456], ["1.234", 123400], ["20.25", 2025],
  ["", null], ["-1", null], ["12,345", null], ["1..20", null], ["10000000000", null]])(
  "interpreta %s em centavos", (entrada, valor) => { expect(valorEmCentavos(String(entrada))).toBe(valor); });
