// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EVENTO_NOTIFICACOES_ATUALIZADAS } from "@/lib/notificacoes";
import { MimoFeedbackNavIndicator } from "./mimo-feedback-nav-indicator";

const mocks = vi.hoisted(() => ({ contar: vi.fn() }));

vi.mock("@/lib/mimo-feedback.functions", () => ({
  contarFeedbacksMimoNaoLidos: mocks.contar,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MimoFeedbackNavIndicator />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("mostra um indicador acessível somente quando há feedback não lido", async () => {
  mocks.contar.mockResolvedValue(1);
  montar();

  expect(await screen.findByRole("status", { name: "Novos feedbacks" })).toBeTruthy();
  expect(mocks.contar).toHaveBeenCalledTimes(1);
});

it("some ao receber a atualização compartilhada depois da leitura", async () => {
  mocks.contar.mockResolvedValueOnce(1).mockResolvedValue(0);
  montar();

  expect(await screen.findByRole("status", { name: "Novos feedbacks" })).toBeTruthy();
  window.dispatchEvent(new Event(EVENTO_NOTIFICACOES_ATUALIZADAS));
  await waitFor(() => expect(screen.queryByRole("status", { name: "Novos feedbacks" })).toBeNull());
  expect(mocks.contar).toHaveBeenCalledTimes(2);
});

it("não mostra indicador quando não há feedback novo", async () => {
  mocks.contar.mockResolvedValue(0);
  montar();

  await waitFor(() => expect(mocks.contar).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("status", { name: "Novos feedbacks" })).toBeNull();
});
