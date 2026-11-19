// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoFeedbackButton } from "./mimo-feedback-button";
import { MimoFeedbacksPage } from "./mimo-feedbacks-page";

const mocks = vi.hoisted(() => ({ listar: vi.fn(), enviar: vi.fn(), alterar: vi.fn() }));
vi.mock("@/lib/mimo-feedback.functions", () => ({
  listarFeedbacksMimo: mocks.listar,
  enviarFeedbackMimo: mocks.enviar,
  alterarFeedbackMimo: mocks.alterar,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, onClick }: { to: string; children: ReactNode; onClick: () => void }) => (
    <a href={to} onClick={onClick}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const id = "12345678-1234-4234-8234-123456789abc";
const sugestao = {
  id, titulo: "Melhorar busca", mensagem: "Encontrar clientes pelo nome.",
  created_at: "2026-11-19T12:00:00+00:00", versao: 1, estado: "recebido",
};

function noPainel(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("envia pelo pop-up e permite acessar o painel de feedbacks", async () => {
  mocks.enviar.mockResolvedValue({ id });
  noPainel(<MimoFeedbackButton />);
  fireEvent.click(screen.getByRole("button", { name: "Dar feedback" }));
  expect(await screen.findByRole("dialog", { name: "Sugira uma melhoria" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver feedbacks" }).getAttribute("href")).toBe("/mimo/feedbacks");
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "  Melhorar busca " } });
  fireEvent.change(screen.getByLabelText("O que podemos melhorar?"), { target: { value: " Encontrar clientes pelo nome. " } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar sugestão" }));
  await waitFor(() => expect(mocks.enviar).toHaveBeenCalledWith({
    data: { id: expect.any(String), titulo: sugestao.titulo, mensagem: sugestao.mensagem },
  }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it.each([false, true])("exibe a sugestão e limita o seletor de status à administração (%s)", async (podeGerenciar) => {
  mocks.listar.mockResolvedValue({ feedbacks: [sugestao], proximo: null, podeGerenciar });
  mocks.alterar.mockResolvedValue({ id });
  noPainel(<MimoFeedbacksPage />);
  expect(await screen.findByText(sugestao.titulo)).toBeTruthy();
  expect(screen.getByText(sugestao.mensagem)).toBeTruthy();
  const seletor = screen.queryByRole("combobox", { name: `Status de ${sugestao.titulo}` });
  if (podeGerenciar && seletor) {
    fireEvent.change(seletor, { target: { value: "concluido" } });
    await waitFor(() => expect(mocks.alterar).toHaveBeenCalledWith({ data: { id, versao: 1, estado: "concluido" } }));
  } else {
    expect(podeGerenciar).toBe(false);
    expect(seletor).toBeNull();
    expect(screen.getByText("Recebido")).toBeTruthy();
  }
});
