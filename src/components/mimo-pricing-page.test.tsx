// @vitest-environment happy-dom
import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MimoPricingPage } from "./mimo-pricing-page";
import seed from "@/lib/__fixtures__/mimo-pricing.json";
import { documentoSchema } from "@/lib/mimo-pricing";
const f = vi.hoisted(() => ({
  carregarPricing: vi.fn(),
  salvarPricing: vi.fn(),
  previaPricing: vi.fn(),
  confirmarPricing: vi.fn(),
  buscarClientesPricing: vi.fn(),
}));
vi.mock("@/lib/mimo-pricing.functions", () => f);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const dados = documentoSchema.parse({
  nome: "Base inicial",
  cliente: null,
  uf: "",
  politicas: [],
  linhas: seed.linhas,
});
const base = {
  id: "30000000-0000-4000-8000-000000000001",
  versao: 1,
  tipo: "base",
  dados,
  updated_at: "2026-11-04T12:00:00Z",
};
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  f.carregarPricing.mockResolvedValue([structuredClone(base)]);
  f.buscarClientesPricing.mockResolvedValue([]);
});
const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoPricingPage />
    </QueryClientProvider>,
  );
it("prévia de 114 registros antecede confirmação da importação", async () => {
  f.previaPricing.mockResolvedValue({
    dados,
    hash: "hash",
    origem: "Planilha inicial",
    base: null,
    revisao: {
      novos: 114,
      alterados: 0,
      erros: [],
      avisos: ["Revisar custos diferentes entre canais: M001"],
    },
  });
  mount();
  await screen.findByText("Revisar importação inicial");
  fireEvent.click(screen.getByText("Revisar importação inicial"));
  await screen.findByText("Prévia de importação");
  expect(f.confirmarPricing).not.toHaveBeenCalled();
  expect(screen.getByText(/114 registros/)).toBeTruthy();
  fireEvent.click(screen.getByText("Confirmar importação"));
  await waitFor(() =>
    expect(f.confirmarPricing).toHaveBeenCalledWith({ data: { hash: "hash", versao: 0 } }),
  );
});
it("simular não salva base; alternativa reabre com premissas preservadas", async () => {
  mount();
  const select = await screen.findByLabelText("Abrir estudo");
  fireEvent.change(select, { target: { value: base.id } });
  const preco = screen.getByLabelText("Preço de tabela (R$)");
  fireEvent.change(preco, { target: { value: "12.345678" } });
  fireEvent.change(screen.getByLabelText("Quantidade faturada prevista"), {
    target: { value: "100" },
  });
  expect(f.salvarPricing).not.toHaveBeenCalled();
  expect(screen.getAllByText("Distribuidor").length).toBeGreaterThan(0);
  const id = "30000000-0000-4000-8000-000000000002";
  f.salvarPricing.mockImplementation(async ({ data }) => {
    const salvo = {
      id,
      versao: 1,
      tipo: "cenario",
      dados: data.dados,
      updated_at: base.updated_at,
    };
    f.carregarPricing.mockResolvedValue([base, salvo]);
    return id;
  });
  fireEvent.click(screen.getByText("Salvar como alternativa"));
  await waitFor(() => expect(f.salvarPricing).toHaveBeenCalled());
  expect(f.salvarPricing.mock.calls[0][0].data).toMatchObject({
    id: null,
    versao: 0,
    tipo: "cenario",
  });
  await screen.findByText("Salvar cenário");
  expect((screen.getByLabelText("Preço de tabela (R$)") as HTMLInputElement).value).toBe(
    "12.345678",
  );
  expect(base.dados.linhas[0].preco).toBe(seed.linhas[0].preco);
});
it("falha de autorização não revela custos", async () => {
  f.carregarPricing.mockRejectedValue(Error("Acesso exclusivo à administração e gestão."));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Custo industrial")).toBeNull();
});
