// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoRetornoCampanhasPage } from "./mimo-retorno-campanhas-page";
const f = vi.hoisted(() => ({ consultar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-retorno-campanhas.functions", () => ({ retornoCampanhasMimo: f.consultar }));
const resultado = {
  campanhas: [
    { campanha: "Campanha A", investimento: 1000, leadsMeta: 2, cplMeta: 500, sobreposto: false },
    {
      campanha: "Campanha B",
      investimento: null,
      leadsMeta: null,
      cplMeta: null,
      sobreposto: true,
    },
  ],
  naoAtribuidos: {
    leads: 3,
    pedidos: 2,
    clientes: 1,
    receitaFaturada: 12000,
    pedidosForaCoorte: 0,
    receitaForaCoorte: 0,
  },
  avisos: { parciais: 0, semMeta: false, semVinculoCampanha: true, pedidosDisponiveis: true },
};
beforeEach(() => f.consultar.mockResolvedValue(resultado));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function montar() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoRetornoCampanhasPage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it("separa receita não atribuída e filtra campanhas sem fabricar ROAS", async () => {
  const user = montar();
  expect(await screen.findByText("Campanha A", { selector: "td" })).toBeTruthy();
  expect(screen.getByText(/Mesmo nomes iguais não comprovam atribuição/)).toBeTruthy();
  const tabela = within(screen.getByRole("table", { name: "Indicadores por campanha" }));
  expect(tabela.getByText("R$ 10,00")).toBeTruthy();
  expect(tabela.getByText("R$ 5,00")).toBeTruthy();
  expect(tabela.queryByText("R$ 120,00")).toBeNull();
  expect(screen.getByText("R$ 120,00")).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Campanha importada"), "Campanha A");
  expect(tabela.queryByText("Campanha B")).toBeNull();
  expect(screen.getByText("R$ 120,00")).toBeTruthy();
  expect(f.consultar).toHaveBeenCalledTimes(1);
});
it("aplica período e trata erro e vazio sem totais fictícios", async () => {
  const user = montar();
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Início"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "2026-10-31" } });
  f.consultar.mockRejectedValueOnce(Error("rede"));
  await user.click(screen.getByRole("button", { name: "Aplicar período" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("R$ 120,00")).toBeNull();
  f.consultar.mockResolvedValue({
    ...resultado,
    campanhas: [],
    naoAtribuidos: { ...resultado.naoAtribuidos, leads: 0, pedidos: null, receitaFaturada: null },
    avisos: { ...resultado.avisos, semMeta: true, pedidosDisponiveis: false },
  });
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(
    await screen.findByText("Nenhuma campanha importada integralmente neste período."),
  ).toBeTruthy();
  expect(screen.getByText(/Isso não significa receita zero/)).toBeTruthy();
  await waitFor(() =>
    expect(f.consultar).toHaveBeenLastCalledWith({
      data: { inicio: "2026-10-01", fim: "2026-10-31" },
    }),
  );
});
