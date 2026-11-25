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
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
it("combina 20 mil ou mais com rede, reinicia a página e exporta todos os resultados filtrados após recarga", async () => {
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
  const elegiveis = Array.from({ length: 26 }, (_, index) => ({
    ...comum,
    id: `elegivel-${index}`,
    nome: `Elegível ${index}`,
    seguidores: 20000 + index,
  }));
  const abaixo = { ...comum, id: "abaixo", nome: "Abaixo do limite", seguidores: 19999 };
  const outraRede = {
    ...comum,
    id: "outra-rede",
    nome: "Perfil TikTok",
    seguidores: 50000,
    rede: "TikTok",
  };
  api.listar.mockResolvedValue([abaixo, outraRede, ...elegiveis]);
  const criarUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:exportacao-sintetica");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoInfluenciadoresPage />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await screen.findByText("Abaixo do limite");
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  expect(screen.getByText("Página 2 de 2")).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Faixa de seguidores"), "20 mil ou mais");
  expect(screen.getByText("Página 1 de 2")).toBeTruthy();
  expect(screen.queryByText("Abaixo do limite")).toBeNull();
  expect(screen.getByText("Elegível 0")).toBeTruthy();

  await user.selectOptions(screen.getByLabelText("Rede"), "Instagram");
  expect(screen.queryByText("Perfil TikTok")).toBeNull();
  expect(screen.getByText(/26 inscrições encontradas/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  expect(screen.getByText("Elegível 25")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Exportar filtrados" }));
  const csv = await (criarUrl.mock.calls[0][0] as Blob).text();
  for (const perfil of elegiveis) expect(csv).toContain(`"${perfil.nome}"`);
  expect(csv).not.toContain(abaixo.nome);
  expect(csv).not.toContain(outraRede.nome);

  api.listar.mockResolvedValue([abaixo, outraRede, ...elegiveis.slice(1)]);
  await user.click(screen.getByRole("button", { name: "Atualizar" }));
  await screen.findByText(/25 inscrições encontradas/);
  expect(screen.getByText("Página 1 de 1")).toBeTruthy();
  expect(screen.queryByText("Elegível 0")).toBeNull();
  expect(screen.queryByText("Perfil TikTok")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Exportar filtrados" }));
  const atualizado = await (criarUrl.mock.calls[1][0] as Blob).text();
  expect(atualizado).not.toContain('"Elegível 0"');
  expect(atualizado).not.toContain(abaixo.nome);
  expect(atualizado).not.toContain(outraRede.nome);
  expect(atualizado).toContain('"Elegível 25"');
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
    { ...comum, id: "perfil-20", nome: "Perfil de 20 mil", seguidores: 20000 },
    { ...comum, id: "perfil-19", nome: "Perfil abaixo de 20 mil", seguidores: 19999 },
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
  await user.selectOptions(screen.getByLabelText("Faixa de seguidores"), "20 mil ou mais");
  expect(screen.getByText("Perfil de 20 mil")).toBeTruthy();
  expect(screen.getByText("Perfil de 200 mil")).toBeTruthy();
  expect(screen.queryByText("Perfil abaixo de 20 mil")).toBeNull();
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
