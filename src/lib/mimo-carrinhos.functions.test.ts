import { beforeEach, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({ exigir: vi.fn(), config: vi.fn(), coletar: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, validator: () => b, handler: (h: unknown) => h };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./mimo-nuvemshop.server", () => ({ coletarNuvem: f.coletar }));
vi.mock("./mimo-nuvemshop-oauth.server", () => ({
  obterConfigNuvem: f.config,
  configOAuthNuvem: () => null,
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: f.rpc } }));
import { listarCarrinhosMimo, sincronizarCarrinhosMimo } from "./mimo-carrinhos.functions";
const emp = "10000000-0000-4000-8000-000000000001";
const executar = (fn: unknown, args: unknown) => (fn as (v: unknown) => Promise<unknown>)(args);
const ctx = { context: { supabase: {}, userId: "ator-verificado" }, data: { pagina: 0 } };
beforeEach(() => {
  vi.resetAllMocks();
  f.exigir.mockResolvedValue({ empresaId: emp, papel: "gestor" });
  f.config.mockReturnValue({ empresa: emp, loja: "123" });
  f.coletar.mockResolvedValue({ carrinhos: [], pedidos: [] });
  f.rpc.mockResolvedValue({ error: null });
});
it.each(["vendedor", "marketing", "administrativo"])(
  "nega %s antes de ler dados ou credenciais",
  async (papel) => {
    f.exigir.mockResolvedValue({ empresaId: emp, papel });
    await expect(executar(listarCarrinhosMimo, ctx)).rejects.toThrow("Acesso exclusivo");
    await expect(executar(sincronizarCarrinhosMimo, ctx)).rejects.toThrow("Acesso exclusivo");
    expect(f.config).not.toHaveBeenCalled();
    expect(f.coletar).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  },
);
it("não usa uma credencial configurada para outra empresa", async () => {
  f.config.mockReturnValue({ empresa: "outra", loja: "123" });
  await expect(executar(sincronizarCarrinhosMimo, ctx)).rejects.toThrow("não foi configurada");
  expect(f.coletar).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
});
it("usa ator e vínculo do servidor, ignorando campos forjados no cliente", async () => {
  await executar(sincronizarCarrinhosMimo, {
    ...ctx,
    data: { _empresa: "outra", _ator: "forjado", _loja: "999" },
  });
  expect(f.rpc).toHaveBeenCalledWith("mimo_nuvem_sincronizar", {
    _empresa: emp,
    _loja: "123",
    _ator: "ator-verificado",
    _carrinhos: [],
    _pedidos: [],
  });
});
it("falha da API não grava lote parcial", async () => {
  f.coletar.mockRejectedValue(Error("API indisponível"));
  await expect(executar(sincronizarCarrinhosMimo, ctx)).rejects.toThrow("API indisponível");
  expect(f.rpc).not.toHaveBeenCalled();
});
