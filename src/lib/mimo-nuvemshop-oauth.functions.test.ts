import { beforeEach, afterEach, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({
  exigir: vi.fn(),
  iniciar: vi.fn(),
  cookie: vi.fn(),
  request: vi.fn(),
  config: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, handler: (h: unknown) => h };
    return b;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: f.request, setCookie: f.cookie }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./mimo-nuvemshop-oauth.server", () => ({
  configOAuthNuvem: f.config,
  iniciarOAuthNuvem: f.iniciar,
  COOKIE_NUVEM: "__Host-mimo_nuvem_oauth",
}));
import { conectarNuvemshopMimo } from "./mimo-nuvemshop-oauth.functions";
const executar = () =>
  (conectarNuvemshopMimo as unknown as (v: unknown) => Promise<unknown>)({
    context: { supabase: {}, userId: "ator-verificado" },
  });
beforeEach(() => {
  vi.resetAllMocks();
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "gestor" });
  f.config.mockReturnValue({ origin: "https://mimo.example.invalid" });
  f.request.mockReturnValue(
    new Request("https://mimo.example.invalid/_serverFn/x", {
      headers: { origin: "https://mimo.example.invalid" },
    }),
  );
  f.iniciar.mockResolvedValue({
    url: "https://www.nuvemshop.com.br/apps/123/authorize?state=estado",
    state: "estado",
  });
});
afterEach(() => vi.unstubAllEnvs());
it("autoriza somente gestão e vincula cookie seguro ao navegador", async () => {
  expect(await executar()).toEqual({
    url: "https://www.nuvemshop.com.br/apps/123/authorize?state=estado",
  });
  expect(f.iniciar).toHaveBeenCalledWith("empresa", "ator-verificado");
  expect(f.cookie).toHaveBeenCalledWith("__Host-mimo_nuvem_oauth", "estado", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
});
it.each(["vendedor", "marketing", "administrativo"])("nega início por %s", async (papel) => {
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
  await expect(executar()).rejects.toThrow("Acesso exclusivo");
  expect(f.iniciar).not.toHaveBeenCalled();
});
it("recusa solicitação de outra origem", async () => {
  f.request.mockReturnValue(
    new Request("https://mimo.example.invalid/_serverFn/x", {
      headers: { origin: "https://outra.example.invalid" },
    }),
  );
  await expect(executar()).rejects.toThrow("endereço autorizado");
  expect(f.iniciar).not.toHaveBeenCalled();
  expect(f.cookie).not.toHaveBeenCalled();
});
