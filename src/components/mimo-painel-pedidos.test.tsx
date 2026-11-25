// @vitest-environment happy-dom
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoPainelPedidos } from "./mimo-painel-pedidos";
import { novoPedido } from "@/lib/mimo-pedido";
const f = vi.hoisted(() => ({ listar: vi.fn(), contexto: vi.fn(), alterar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-pedido.functions", () => ({
  listarPedidosMimo: f.listar,
  alterarStatusPedidoMimo: f.alterar,
  carregarTiraMimo: f.contexto,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
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
const empresa = "10000000-0000-4000-8000-000000000001";
const usuario = "20000000-0000-4000-8000-000000000001";
const pedido = {
  id: "pedido-1",
  numero: 42,
  empresa_id: empresa,
  versao: 1,
  status: "rascunho",
  total: 12345,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-24T12:00:00Z",
  documento: { ...novoPedido(), cliente: "Cliente sintético", responsavelId: usuario },
  pix: null,
};
const resposta = {
  disponivel: true,
  itens: [pedido],
  total: 21,
  contextoPedidos: {
    "pedido-1": { origemLead: "whatsapp", responsavelNome: "Responsável sintético" },
  },
};
beforeEach(() => {
  f.contexto.mockResolvedValue({
    disponivel: true,
    empresaId: empresa,
    usuarioId: usuario,
    papel: "vendedor",
  });
  f.listar.mockResolvedValue(resposta);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function montar() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoPainelPedidos />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it("apresenta os dados canônicos e mantém vendedor sem ação de faturar", async () => {
  montar();
  expect(await screen.findByText("Cliente sintético")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Abrir pedido 42" }).getAttribute("href")).toBe(
    "/mimo/tira-pedido",
  );
  expect(screen.getByText("R$ 123,45")).toBeTruthy();
  expect(screen.getByText("01/11/2026")).toBeTruthy();
  expect(screen.getByText("24/11/2026")).toBeTruthy();
  expect(screen.getByText("WhatsApp")).toBeTruthy();
  expect(screen.getByText("Responsável sintético")).toBeTruthy();
  expect(within(screen.getByRole("table")).getByText("Rascunho")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Faturar pedido/ })).toBeNull();
  expect(screen.getByText(/Página 1 de 3/)).toBeTruthy();
});
it("combina filtros no servidor, reinicia a paginação e permite limpar", async () => {
  const user = montar();
  await screen.findByText("Cliente sintético");
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ pagina: 2, incluirContexto: true }),
    }),
  );
  await user.type(screen.getByLabelText("Cliente ou número"), "42");
  await user.selectOptions(screen.getByLabelText("Status"), "entregue");
  fireEvent.change(screen.getByLabelText("Criados de"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Criados até"), { target: { value: "2026-11-24" } });
  f.listar.mockResolvedValue({ ...resposta, total: 1 });
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        pagina: 1,
        busca: "42",
        status: "entregue",
        inicio: "2026-11-01",
        fim: "2026-11-24",
      }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        pagina: 1,
        busca: "",
        status: null,
        inicio: null,
        fim: null,
      }),
    }),
  );
});
it("não envia intervalo invertido e recupera a última página após recarga", async () => {
  const user = montar();
  await screen.findByText("Cliente sintético");
  fireEvent.change(screen.getByLabelText("Criados de"), { target: { value: "2026-12-01" } });
  fireEvent.change(screen.getByLabelText("Criados até"), { target: { value: "2026-11-01" } });
  await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
  expect(screen.getByRole("alert").textContent).toContain("data inicial");
  expect(f.listar).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Próxima" }));
  await screen.findByText(/Página 2 de 3/);
  f.listar.mockResolvedValue({ ...resposta, total: 1 });
  await user.click(screen.getByRole("button", { name: "Atualizar pedidos" }));
  await waitFor(() =>
    expect(f.listar).toHaveBeenLastCalledWith({ data: expect.objectContaining({ pagina: 1 }) }),
  );
  expect(await screen.findByText(/Página 1 de 1/)).toBeTruthy();
});
it("mostra carregamento, falha recuperável e vazio", async () => {
  f.listar
    .mockRejectedValueOnce(Error("rede"))
    .mockResolvedValue({ ...resposta, itens: [], total: 0 });
  const user = montar();
  expect(screen.getByText("Carregando pedidos…")).toBeTruthy();
  expect(await screen.findByRole("alert")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Nenhum pedido encontrado.")).toBeTruthy();
});
it("não consulta pedidos se a autorização do contexto falhar", async () => {
  f.contexto.mockRejectedValue(Error("Acesso negado"));
  montar();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(f.listar).not.toHaveBeenCalled();
});
