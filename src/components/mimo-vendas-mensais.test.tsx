// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TabelaVendasMensais } from "./mimo-vendas-mensais";
vi.mock("@/lib/mimo-vendas-mensais.functions", () => ({ consultarVendasMensais: vi.fn() }));

it("exibe os dias, feriado, subtotais e meta mensal independentes em pt-BR", () => {
  const linha = { orcado: 0, realizado: 25050, coberturaBps: 0, diferenca: 25100 };
  render(<TabelaVendasMensais dados={{ competencia: "2025-01-01",
    semanas: [{ numero: 1, dias: [{ ...linha, data: "2025-01-01", feriado: true }], total: linha }],
    total: { orcado: 100000, realizado: 25050, coberturaBps: 2505, diferenca: -74900 } }} />);
  expect(screen.getByText("Vendas diárias · janeiro de 2025")).toBeDefined();
  const dia = screen.getByRole("row", { name: /01\/01 Feriado/ });
  expect(within(dia).getByText("250,50")).toBeDefined();
  expect(screen.getByRole("row", { name: /Total · S1/ })).toBeDefined();
  const total = screen.getByRole("row", { name: /Total do mês/ });
  expect(within(total).getByText("1.000,00")).toBeDefined();
  expect(within(total).getByText("25,05%")).toBeDefined();
  expect(within(total).getByText("-749,00")).toBeDefined();
});
