// @vitest-environment happy-dom
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MimoRepresentantesPage } from "./mimo-representantes-page";
const api = vi.hoisted(() => ({
  listar: vi.fn(),
  editar: vi.fn(),
  excluir: vi.fn(),
  historico: vi.fn(),
}));
vi.mock("@/lib/mimo-representantes.functions", () => ({
  listarRepresentantesMimo: api.listar,
  editarRepresentanteMimo: api.editar,
  excluirRepresentanteMimo: api.excluir,
  historicoRepresentanteMimo: api.historico,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("atualiza contagem, filtra seleção e exibe ficha completa com exclusão confirmada", async () => {
  const r = {
    id: "10000000-0000-4000-8000-000000000001",
    empresa_id: "10000000-0000-4000-8000-000000000002",
    nome: "Representante experiente",
    email: "teste@example.invalid",
    whatsapp: "11999991234",
    cidade: "São Paulo",
    uf: "SP",
    regiao_atuacao: "Grande São Paulo",
    experiencia: "mais3",
    segmentos: ["produtos_naturais", "farmacias"],
    carteira_clientes: 200,
    marcas_atuais: "Marca sintética",
    core: "ativo",
    disponibilidade: "imediata",
    motivacao: "Quero ampliar o acesso a alimentos saudáveis na minha região.",
    consentimento: true,
    etapa: "Novo",
    versao: 1,
    notas: "",
    created_at: "2026-11-11T12:00:00Z",
    updated_at: "2026-11-11T12:00:00Z",
    excluido_em: null,
    excluido_por: null,
  };
  api.listar
    .mockResolvedValueOnce([
      r,
      {
        ...r,
        id: "10000000-0000-4000-8000-000000000003",
        nome: "Primeiro cadastro",
        experiencia: "sem",
        carteira_clientes: 0,
      },
    ])
    .mockResolvedValue([]);
  api.historico.mockResolvedValue([]);
  api.excluir.mockResolvedValue({ excluido: true });
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MimoRepresentantesPage />
    </QueryClientProvider>,
  );
  await screen.findByText("Representante experiente");
  expect(within(screen.getByRole("group", { name: "Mais de 3 anos" })).getByText("1")).toBeTruthy();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Experiência"), "mais3");
  expect(screen.queryByText("Primeiro cadastro")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Avaliar" }));
  const f = within(screen.getByRole("dialog"));
  expect(f.getByRole("link", { name: r.email }).getAttribute("href")).toBe(
    "mailto:teste@example.invalid",
  );
  expect(f.getByRole("link", { name: "WhatsApp: 11999991234" })).toBeTruthy();
  expect(f.getByText("Marca sintética")).toBeTruthy();
  expect(
    f.getByText("Quero ampliar o acesso a alimentos saudáveis na minha região.", { exact: false }),
  ).toBeTruthy();
  expect(
    f.getByText("Informações autodeclaradas · aceite para seleção e contato registrado."),
  ).toBeTruthy();
  await user.click(f.getByRole("button", { name: "Excluir da lista" }));
  expect(api.excluir).not.toHaveBeenCalled();
  await user.click(f.getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(api.excluir).toHaveBeenCalledWith({ data: { id: r.id, versao: 1 } }));
  expect(
    await screen.findByText(
      "Os cadastros aparecerão aqui assim que o formulário receber inscrições.",
    ),
  ).toBeTruthy();
});
