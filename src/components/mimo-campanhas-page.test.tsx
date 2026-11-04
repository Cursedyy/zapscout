// @vitest-environment happy-dom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, it, expect, vi } from "vitest";
import { MimoCampanhasPage } from "./mimo-campanhas-page";
const api = vi.hoisted(() => ({ listar: vi.fn(), salvar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-campanhas.functions", () => ({
  listarCampanhasMimo: api.listar,
  salvarCampanhaMimo: api.salvar,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function abrir() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MimoCampanhasPage />
    </QueryClientProvider>,
  );
}
it("permite cadastrar a promoção e envia suas condições completas", async () => {
  api.listar.mockResolvedValue({ campanhas: [], podeGerenciar: true });
  api.salvar.mockResolvedValue({ id: "nova" });
  abrir();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Nova campanha" }));
  await user.type(screen.getByLabelText("Nome da campanha"), "Promoção do mês");
  await user.type(screen.getByLabelText("Produtos participantes"), "Kit novembro");
  await user.type(
    screen.getByLabelText("Preços e condições promocionais"),
    "R$ 99 à vista; mínimo 10 kits",
  );
  await user.selectOptions(screen.getByLabelText("Disponibilidade"), "publicada");
  await user.click(screen.getByRole("button", { name: "Salvar campanha" }));
  await waitFor(() =>
    expect(api.salvar).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nome: "Promoção do mês",
        produtos: "Kit novembro",
        condicoes: "R$ 99 à vista; mínimo 10 kits",
        status: "publicada",
      }),
    }),
  );
  await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar campanha" })).toBeNull());
});
it("mostra a promoção para vendedor sem ações de edição", async () => {
  api.listar.mockResolvedValue({
    podeGerenciar: false,
    campanhas: [
      {
        id: "campanha",
        nome: "Promoção atual",
        inicio: "2020-01-01",
        fim: "2099-12-31",
        produtos: "Kit",
        condicoes: "Frete especial",
        status: "publicada",
        versao: 1,
      },
    ],
  });
  abrir();
  expect(await screen.findByText("Promoção atual")).toBeTruthy();
  expect(screen.getByText("Frete especial")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Nova campanha" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
});
