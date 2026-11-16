import { afterEach, expect, it, vi } from "vitest";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ client: (fn: unknown) => fn }),
}));
vi.mock("./client", () => ({ supabase: { auth: { getSession } } }));
import { attachSupabaseAuth } from "./auth-attacher";
const executar = attachSupabaseAuth as unknown as (args: {
  next: (args: unknown) => Promise<void>;
}) => Promise<void>;
afterEach(() => {
  vi.useRealTimers();
  getSession.mockReset();
});
it("sessão presa não dispara uma função autenticada sem token", async () => {
  vi.useFakeTimers();
  getSession.mockImplementation(() => new Promise(() => {}));
  const next = vi.fn();
  const p = executar({ next });
  const assertion = expect(p).rejects.toThrow("demorou para responder");
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
  expect(next).not.toHaveBeenCalled();
});
it("erro de sessão é propagado sem executar o próximo passo", async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: Error("sessao_invalida") });
  const next = vi.fn();
  await expect(executar({ next })).rejects.toThrow("sessao_invalida");
  expect(next).not.toHaveBeenCalled();
});
it("preserva o token de uma sessão válida", async () => {
  getSession.mockResolvedValue({
    data: { session: { access_token: "token-sintetico" } },
    error: null,
  });
  const next = vi.fn();
  await executar({ next });
  expect(next).toHaveBeenCalledWith({ headers: { Authorization: "Bearer token-sintetico" } });
});
