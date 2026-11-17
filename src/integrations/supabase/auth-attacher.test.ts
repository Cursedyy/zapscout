import { afterEach, expect, it, vi } from "vitest";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ client: (fn: unknown) => fn }),
}));
vi.mock("./client", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@/lib/auth-precheck.functions", () => ({
  precheckLogin: { url: "/_serverFn/login-publico" },
  precheckSignup: { url: "/_serverFn/cadastro-publico" },
  precheckPasswordReset: { url: "/_serverFn/recuperacao-publica" },
  logLoginFailure: { url: "/_serverFn/falha-publica" },
}));
import { attachSupabaseAuth } from "./auth-attacher";
const executar = attachSupabaseAuth as unknown as (args: {
  next: (args: unknown) => Promise<void>;
  serverFnMeta?: { id: string };
}) => Promise<void>;
afterEach(() => {
  vi.useRealTimers();
  getSession.mockReset();
});
it.each(["login-publico", "cadastro-publico", "recuperacao-publica", "falha-publica"])(
  "%s alcança a verificação do servidor sem esperar a sessão antiga",
  async (id) => {
    getSession.mockImplementation(() => new Promise(() => {}));
    const next = vi.fn();
    await executar({ next, serverFnMeta: { id } });
    expect(getSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledExactlyOnceWith({ headers: {} });
  },
);
it("uma função desconhecida continua exigindo uma sessão legível", async () => {
  getSession.mockRejectedValue(Error("refresh_indisponivel"));
  const next = vi.fn();
  await expect(executar({ next, serverFnMeta: { id: "operacao-privada" } })).rejects.toThrow("refresh_indisponivel");
  expect(next).not.toHaveBeenCalled();
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

