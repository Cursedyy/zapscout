// @vitest-environment happy-dom
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MimoInfluenciadoresPage } from "./mimo-influenciadores-page";
const api = vi.hoisted(() => ({
  listar: vi.fn(),
  historico: vi.fn(),
  editar: vi.fn(),
  excluir: vi.fn(),
}));
vi.mock("@/lib/mimo-influenciadores.functions", () => ({
  listarInfluenciadoresMimo: api.listar,
  historicoInfluenciadorMimo: api.historico,
  editarInfluenciadorMimo: api.editar,
  excluirInfluenciadorMimo: api.excluir,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("conta e filtra o perfil de 200 mil sem misturá-lo à faixa até 100 mil", async () => {
  const comum = {
    empresa_id: "10000000-0000-4000-8000-000000000002",
    campanha: "lancamento-2026-11",
    whatsapp: "11000000000",
    rede: "Instagram",
    perfil: "perfil_sintetico",
    cidade: "São Paulo",
    uf: "SP",
    visualizacoes: "Mais de 20 mil",
    nicho: "Lifestyle e rotina",
    parceria: "Ambas as opções",
    consentimento: true,
    etapa: "Novo",
    versao: 1,
    notas: "",
    created_at: "2026-11-11T12:00:00Z",
    updated_at: "2026-11-11T12:00:00Z",
  };
  api.listar.mockResolvedValue([
    { ...comum, id: "perfil-200", nome: "Perfil de 200 mil", seguidores: 200000 },
    { ...comum, id: "perfil-100", nome: "Perfil de 100 mil", seguidores: 100000 },
  ]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoInfluenciadoresPage />
    </QueryClientProvider>,
  );
  await screen.findByText("Perfil de 200 mil");
  expect(
    within(screen.getByRole("group", { name: "Inscritos acima de 100 mil" })).getByText("1"),
  ).toBeTruthy();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Faixa de seguidores"), "Acima de 100 mil");
  expect(screen.getByText("Perfil de 200 mil")).toBeTruthy();
  expect(screen.queryByText("Perfil de 100 mil")).toBeNull();
  await user.selectOptions(
    screen.getByLabelText("Faixa de seguidores"),
    "Mais de 50 mil até 100 mil",
  );
  expect(screen.getByText("Perfil de 100 mil")).toBeTruthy();
  expect(screen.queryByText("Perfil de 200 mil")).toBeNull();
});
it("exibe todos os dados recebidos e só exclui após confirmação, atualizando a lista", async () => {
  const pessoa = {
    id: "10000000-0000-4000-8000-000000000001",
    empresa_id: "10000000-0000-4000-8000-000000000002",
    campanha: "lancamento-2026-11",
    nome: "Perfil sintético",
    whatsapp: "11999991234",
    rede: "Instagram",
    perfil: "perfil_sintetico",
    cidade: "São Paulo",
    uf: "SP",
    seguidores: 12345,
    visualizacoes: "Mais de 1 mil até 5 mil",
    nicho: "Maternidade e família",
    parceria: "Ambas as opções",
    consentimento: true,
    etapa: "Novo",
    versao: 1,
    notas: "",
    created_at: "2026-11-11T12:00:00Z",
    updated_at: "2026-11-11T12:00:00Z",
  };
  api.listar.mockResolvedValueOnce([pessoa]).mockResolvedValue([]);
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
      <MimoInfluenciadoresPage />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const metas = await screen.findByRole("region", { name: "Inscrições por categoria" });
  await waitFor(() => expect(within(metas).getByText("1 / 240")).toBeTruthy());
  expect(within(metas).getByRole("progressbar", { name: "Meta Micro" }).getAttribute("value")).toBe(
    "1",
  );
  expect(screen.getByText("0 / 400")).toBeTruthy();
  await user.click(await screen.findByRole("button", { name: "Avaliar" }));
  const ficha = within(screen.getByRole("dialog"));
  expect(ficha.getByText(pessoa.nome)).toBeTruthy();
  expect(ficha.getByText("São Paulo / SP")).toBeTruthy();
  expect(
    ficha.getByRole("link", { name: "Instagram · @perfil_sintetico" }).getAttribute("href"),
  ).toBe("https://www.instagram.com/perfil_sintetico/");
  expect(ficha.getByRole("link", { name: "WhatsApp: 11999991234" }).getAttribute("href")).toBe(
    "https://wa.me/5511999991234",
  );
  expect(ficha.getByText(/12.345 seguidores/)).toBeTruthy();
  expect(ficha.getByText("Maternidade e família · Ambas as opções")).toBeTruthy();
  expect(ficha.getByText("Aceite para seleção e contato registrado na inscrição.")).toBeTruthy();
  await user.click(ficha.getByRole("button", { name: "Excluir da lista" }));
  expect(api.excluir).not.toHaveBeenCalled();
  await user.click(ficha.getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() =>
    expect(api.excluir).toHaveBeenCalledWith({ data: { id: pessoa.id, versao: 1 } }),
  );
  expect(
    await screen.findByText(
      "As inscrições aparecerão aqui assim que o formulário receber cadastros.",
    ),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Avaliar" })).toBeNull();
  expect(within(metas).getByText("0 / 240")).toBeTruthy();
});
