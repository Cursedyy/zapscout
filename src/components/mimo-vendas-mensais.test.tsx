// @vitest-environment happy-dom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TabelaVendasMensais } from "./mimo-vendas-mensais";
import { calcularVendasMensais, type EdicaoVendas } from "@/lib/mimo-vendas-mensais";
vi.mock("@/lib/mimo-vendas-mensais.functions", () => ({ consultarVendasMensais: vi.fn(), salvarValorVendas: vi.fn() }));
afterEach(cleanup);

const registro = { competencia: "2025-01-01", demonstrativo: { total: { orcado: 100000 }, semanas: [
  { numero: 1, dias: [{ data: "2025-01-01", feriado: true, realizado: 25050 }, { data: "2025-01-02", feriado: false, realizado: 0 }] },
] } };
function Planilha({ aoSalvar }: { aoSalvar: (e: EdicaoVendas) => void }) {
  const [ajustes, setAjustes] = useState<Record<string, number>>({});
  return <TabelaVendasMensais dados={calcularVendasMensais({ ...registro, ajustes })} salvar={async e => {
    aoSalvar(e);
    setAjustes(v => ({ ...v, [e.dia ?? "meta"]: e.valor }));
  }} />;
}

it("salva a venda do dia e atualiza a cobertura da semana e do mês", async () => {
  const gravar = vi.fn();
  render(<Planilha aoSalvar={gravar} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar realizado de 02/01" }));
  fireEvent.change(screen.getByRole("textbox", { name: "realizado de 02/01 em reais" }), { target: { value: "249,50" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByRole("button", { name: "Editar realizado de 02/01" });
  expect(gravar).toHaveBeenCalledWith({ competencia: "2025-01-01", dia: "2025-01-02", esperado: 0, valor: 24950 });
  for (const name of [/Total · S1/, /Total do mês/]) {
    const linha = within(screen.getByRole("row", { name }));
    expect(linha.getByText("500,00")).toBeDefined();
    expect(linha.getByText("50,00%")).toBeDefined();
    expect(linha.getByText("-500,00")).toBeDefined();
  }
});

it("edita a meta mensal no painel, valida o valor e permite cancelar", async () => {
  const gravar = vi.fn();
  render(<Planilha aoSalvar={gravar} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar meta mensal" }));
  const entrada = screen.getByRole("textbox", { name: "meta mensal em reais" });
  fireEvent.change(entrada, { target: { value: "-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(screen.getByRole("alert")).toBeDefined();
  expect(gravar).not.toHaveBeenCalled();
  fireEvent.change(entrada, { target: { value: "501,00" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  expect(gravar).toHaveBeenCalledWith({ competencia: "2025-01-01", dia: null, esperado: 100000, valor: 50100 });
  expect(within(screen.getByRole("row", { name: /Total do mês/ })).getByText("50,00%")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Editar realizado de 01/01" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(gravar).toHaveBeenCalledTimes(1);
});
