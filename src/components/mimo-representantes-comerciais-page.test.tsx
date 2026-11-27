// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { calcularDesempenho } from "@/lib/mimo-representantes-comerciais";
import { MimoRepresentantesComerciaisPage } from "./mimo-representantes-comerciais-page";

const api = vi.hoisted(() => ({
  carregar: vi.fn(),
  desempenho: vi.fn(),
  salvar: vi.fn(),
  importar: vi.fn(),
  atribuir: vi.fn(),
  historico: vi.fn(),
}));
vi.mock("@/lib/mimo-representantes-comerciais.functions", () => ({
  carregarRepresentantesComerciais: api.carregar,
  desempenhoRepresentantesComerciais: api.desempenho,
  salvarRepresentanteComercial: api.salvar,
  importarRepresentantesComerciais: api.importar,
  atribuirClienteRepresentante: api.atribuir,
  historicoRepresentantesComerciais: api.historico,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

// Base sintética.
const R1 = "10000000-0000-4000-8000-0000000000a1",
  R2 = "10000000-0000-4000-8000-0000000000a2",
  U1 = "30000000-0000-4000-8000-000000000001",
  U2 = "30000000-0000-4000-8000-000000000002";
const rep = (id: string, nome: string, comissao_bps: number) => ({
  id,
  empresa_id: "e",
  nome,
  chave: nome.toLowerCase(),
  ativo: true,
  comissao_bps,
  telefone: "",
  email: "",
  observacoes: "",
  versao: 1,
  criado_por: "u",
  atualizado_por: "u",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});
const ter = (uf: string, representante_id: string, principal: boolean) => ({
  empresa_id: "e",
  uf,
  representante_id,
  principal,
  regiao: "Sul",
  estado: "",
  updated_at: "",
});
const base = {
  representantes: [rep(R1, "Rep Sintético Um", 500), rep(R2, "Rep Sintético Dois", 350)],
  territorios: [ter("PR", R1, true), ter("PR", R2, false)],
  clientes: [],
  unidades: [
    { id: U1, nome: "Loja Alfa", cidade: "Curitiba", uf: "PR" },
    { id: U2, nome: "Loja Sem UF", cidade: "", uf: "" },
  ],
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.carregar.mockResolvedValue(base);
  api.desempenho.mockImplementation(({ data }) =>
    Promise.resolve({
      periodo: data,
      ...calcularDesempenho({
        ...base,
        negociacoes: [{ unidade_id: U1, lead_id: "L1" }],
        pedidos: [
          { id: "p1", lead_id: "L1", status: "faturado", total: 123_456, faturado_em: data.de },
        ],
      }),
    }),
  );
  render(
    <QueryClientProvider client={qc}>
      <MimoRepresentantesComerciaisPage />
    </QueryClientProvider>,
  );
}

it("mostra faturamento, comissão e o grupo Sem representante", async () => {
  montar();
  const tabela = await screen.findByRole("table");
  const linha = within(tabela).getByText("Rep Sintético Um").closest("tr")!;
  expect(linha.textContent).toContain("5%");
  expect(linha.textContent).toMatch(/1\.234,56/);
  expect(linha.textContent).toMatch(/61,73/); // 1.234,56 × 5% = 61,728 → 61,73
  const sem = within(tabela).getByText("Sem representante").closest("tr")!;
  expect(sem.textContent).toContain("1"); // Loja Sem UF
  expect(api.desempenho).toHaveBeenCalledWith({
    data: expect.objectContaining({ de: expect.any(String) }),
  });
});

it("importa planilha colada após a pré-visualização", async () => {
  const user = userEvent.setup();
  montar();
  api.importar.mockResolvedValue({ criados: 1, atualizados: 0, inalterados: 0, territorios: 1 });
  await user.click(await screen.findByRole("tab", { name: "Importar planilha" }));
  await user.click(screen.getByLabelText(/cole as linhas/i));
  await user.paste(
    "REGIÃO\tESTADO\tUF\tREPRESENTANTE(S)\tCOMISSÕES %\tCONTAR UF\nSul\tParaná\tPR\tRep Novo\t0,035\t1",
  );
  await user.click(screen.getByRole("button", { name: "Pré-visualizar" }));
  expect(await screen.findByText("Rep Novo")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Importar 1 representantes/ }));
  await waitFor(() =>
    expect(api.importar).toHaveBeenCalledWith({
      data: {
        representantes: [{ nome: "Rep Novo", comissao_bps: 350 }],
        territorios: [
          { uf: "PR", nome: "Rep Novo", principal: true, regiao: "Sul", estado: "Paraná" },
        ],
      },
    }),
  );
});

it("bloqueia importação com erros", async () => {
  const user = userEvent.setup();
  montar();
  await user.click(await screen.findByRole("tab", { name: "Importar planilha" }));
  await user.click(screen.getByLabelText(/cole as linhas/i));
  await user.paste("UF\tREPRESENTANTE\tCOMISSAO\nPR\tRep A\t0,035\nPR\tRep B\t0,05");
  await user.click(screen.getByRole("button", { name: "Pré-visualizar" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/CONTAR UF/);
  expect((screen.getByRole("button", { name: /^Importar/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("atribui cliente manualmente com motivo", async () => {
  const user = userEvent.setup();
  montar();
  api.atribuir.mockResolvedValue({});
  await user.click(await screen.findByRole("tab", { name: "Clientes" }));
  const linha = (await screen.findByText("Loja Alfa")).closest("tr")!;
  expect(linha.textContent).toMatch(/Rep Sintético Um\s*\(pela UF\)/);
  expect(screen.getByText("Loja Sem UF").closest("tr")!.textContent).toMatch(/Cliente sem UF/);
  await user.click(within(linha).getByRole("button", { name: "Alterar" }));
  const dialog = await screen.findByRole("dialog");
  await user.selectOptions(within(dialog).getByRole("combobox"), R2);
  await user.type(within(dialog).getByRole("textbox"), "Atende a rede inteira");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() =>
    expect(api.atribuir).toHaveBeenCalledWith({
      data: { unidade_id: U1, representante_id: R2, motivo: "Atende a rede inteira", versao: null },
    }),
  );
});

it("cadastra representante com comissão em percentual e território", async () => {
  const user = userEvent.setup();
  montar();
  api.salvar.mockResolvedValue({});
  await user.click(await screen.findByRole("tab", { name: "Representantes" }));
  await user.click(screen.getByRole("button", { name: "Novo representante" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Nome"), "Rep Sintético Três");
  await user.type(within(dialog).getByLabelText("Comissão (%)"), "4,25");
  await user.selectOptions(within(dialog).getByLabelText("Território SP"), "principal");
  await user.selectOptions(within(dialog).getByLabelText("Território PR"), "secundario");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() =>
    expect(api.salvar).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: null,
        nome: "Rep Sintético Três",
        comissao_bps: 425,
        territorios: expect.arrayContaining([
          { uf: "SP", principal: true },
          { uf: "PR", principal: false },
        ]),
      }),
    }),
  );
});
