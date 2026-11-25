// @vitest-environment happy-dom
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoRastreamentoPage } from "./mimo-rastreamento-page";

const f = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-rastreamento.functions", () => ({ listarRastreamentoMimo: f.listar }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: PropsWithChildren<
    AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; search?: unknown }
  >) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const resposta = {
  disponivel: true,
  total: 1,
  itens: [
    {
      id: "p1",
      empresaId: "e1",
      numero: 42,
      cliente: "Cliente sintético",
      status: "enviado",
      criadoEm: "2026-11-20T12:00:00Z",
      atualizadoEm: "2026-11-24T12:00:00Z",
      faturadoEm: "2026-11-20",
      transportadora: "Transportadora sintética",
      modalidade: "Expresso",
      codigoServico: "EXP-42",
      prazo: "3 dias úteis",
      postagem: null,
    },
  ],
};
beforeEach(() => f.listar.mockResolvedValue(resposta));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function montar() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoRastreamentoPage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

it("mostra fonte canônica, aviso de limite e layout de entrega", async () => {
  montar();
  expect(await screen.findByText("Cliente sintético")).toBeTruthy();
  expect(screen.getByText("Transportadora sintética")).toBeTruthy();
  expect(screen.getByText("EXP-42")).toBeTruthy();
  expect(screen.getByText(/Rastreio externo indisponível/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Abrir pedido 42" }).getAttribute("href")).toBe(
    "/mimo/tira-pedido",
  );
});

it("envia busca e filtros, valida período e limpa", async () => {
  const user = montar();
  await screen.findByText("Cliente sintético");
  await user.type(screen.getByLabelText("Pedido, cliente ou código do serviço"), "EXP-42");
  await user.selectOptions(screen.getByLabelText("Status"), "enviado");
  fireEvent.change(screen.getByLabelText("Atualizados de"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Atualizados até"), { target: { value: "2026-11-24" } });
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        busca: "EXP-42",
        status: "enviado",
        inicio: "2026-11-01",
        fim: "2026-11-24",
      }),
    }),
  );
  fireEvent.change(screen.getByLabelText("Atualizados de"), { target: { value: "2026-12-01" } });
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(screen.getByRole("alert").textContent).toContain("data final");
  await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ busca: "", status: null }),
    }),
  );
});

it("cobre carregamento, erro recuperável e vazio", async () => {
  f.listar
    .mockRejectedValueOnce(Error("rede"))
    .mockResolvedValueOnce({ disponivel: true, itens: [], total: 0 });
  const user = montar();
  expect(screen.getByText("Carregando entregas…")).toBeTruthy();
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Nenhuma entrega encontrada")).toBeTruthy();
});
