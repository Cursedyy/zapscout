// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoOmiePage } from "./mimo-omie-page";
const api = vi.hoisted(() => ({
  status: vi.fn(),
  consultar: vi.fn(),
  preparar: vi.fn(),
  confirmar: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-omie.functions", () => ({
  statusOmieMimo: api.status,
  consultarOmieMimo: api.consultar,
  prepararCfopMimo: api.preparar,
  confirmarCfopMimo: api.confirmar,
}));
beforeEach(() => {
  api.status.mockResolvedValue({
    disponivel: true,
    mensagem: "Modo de simulação: nenhuma alteração será enviada ao OMIE.",
  });
  api.consultar.mockResolvedValue({
    pedidoId: 123,
    numero: "PV-1",
    versao: "a".repeat(64),
    editavel: true,
    itens: [{ itemId: 1, descricao: "Produto sintético", cfop: "5.102" }],
  });
  api.preparar.mockResolvedValue({
    id: "previa-sintetica",
    pedidoId: 123,
    expiraEm: "2026-12-01T12:00:00Z",
    mudancas: [{ itemId: 1, anterior: "5.102", novo: "6.102" }],
  });
  api.confirmar.mockResolvedValue({ estado: "simulada" });
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
      <MimoOmiePage />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it("apresenta configuração ausente sem oferecer ações", async () => {
  api.status.mockResolvedValue({ disponivel: false, mensagem: "Integração OMIE indisponível." });
  montar();
  expect(await screen.findByText("Integração OMIE indisponível.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Consultar pedido" })).toBeNull();
  expect(api.consultar).not.toHaveBeenCalled();
});
it("exige prévia e confirmação explícita, deixando claro que não grava no OMIE", async () => {
  const user = montar();
  await user.type(await screen.findByLabelText("Código interno do pedido OMIE"), "123");
  await user.click(screen.getByRole("button", { name: "Consultar pedido" }));
  await user.type(await screen.findByLabelText("Novo CFOP do item 1"), "6102");
  await user.click(screen.getByRole("button", { name: "Gerar prévia" }));
  expect(await screen.findByText("Item 1: 5.102 → 6.102")).toBeTruthy();
  const confirmar = screen.getByRole("button", {
    name: "Confirmar simulação",
  }) as HTMLButtonElement;
  expect(confirmar.disabled).toBe(true);
  expect(api.confirmar).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(confirmar);
  expect(
    await screen.findByText(
      "Simulação registrada na auditoria. Nenhum pedido foi alterado no OMIE.",
    ),
  ).toBeTruthy();
  expect(api.preparar).toHaveBeenCalledWith({
    data: { pedidoId: 123, versao: "a".repeat(64), mudancas: [{ itemId: 1, cfop: "6.102" }] },
  });
  expect(api.confirmar).toHaveBeenCalledWith({
    data: { previaId: "previa-sintetica", confirmar: true },
  });
});
it("descarta prévia ao editar CFOP e trata falha de consulta sem manter dados anteriores", async () => {
  const user = montar();
  await user.type(await screen.findByLabelText("Código interno do pedido OMIE"), "123");
  await user.click(screen.getByRole("button", { name: "Consultar pedido" }));
  await user.type(await screen.findByLabelText("Novo CFOP do item 1"), "6102");
  await user.click(screen.getByRole("button", { name: "Gerar prévia" }));
  await screen.findByText("Item 1: 5.102 → 6.102");
  await user.clear(screen.getByLabelText("Novo CFOP do item 1"));
  expect(screen.queryByRole("button", { name: "Confirmar simulação" })).toBeNull();
  api.consultar.mockRejectedValue(Error("Pedido indisponível."));
  await user.click(screen.getByRole("button", { name: "Consultar pedido" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Pedido indisponível."));
  expect(screen.queryByLabelText("Novo CFOP do item 1")).toBeNull();
});
