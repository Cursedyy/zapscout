import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ exigir: vi.fn(), rpc: vi.fn(), config: vi.fn(), worker: vi.fn() }));
vi.mock("./mimo-recuperacao-worker.server", () => ({ executarRecuperacaoMimo: f.worker }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const b = { middleware: () => b, validator: () => b, handler: (h: unknown) => h };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: f.rpc } }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.exigir }));
vi.mock("./mimo-nuvemshop-oauth.server", () => ({
  configOAuthNuvem: f.config,
  obterConfigNuvem: vi.fn(),
}));
import {
  configurarRecuperacaoMimo,
  obterIndicadoresRecuperacaoMimo,
  enviarLembreteManualMimo,
} from "./mimo-carrinhos-recuperacao.functions";
const executar = (fn: unknown, data?: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({
    context: { supabase: {}, userId: "ator-verificado" },
    data,
  });
beforeEach(() => {
  vi.resetAllMocks();
  f.exigir.mockResolvedValue({ empresaId: "empresa", papel: "gestor" });
  f.rpc.mockResolvedValue({ data: null, error: null });
});
it.each(["vendedor", "marketing", "administrativo"])(
  "nega indicadores e alteração por %s",
  async (papel) => {
    f.exigir.mockResolvedValue({ empresaId: "empresa", papel });
    await expect(executar(obterIndicadoresRecuperacaoMimo)).rejects.toThrow("Acesso exclusivo");
    await expect(executar(configurarRecuperacaoMimo, { ativo: true })).rejects.toThrow(
      "Acesso exclusivo",
    );
    await expect(executar(enviarLembreteManualMimo, { checkout: "42" })).rejects.toThrow(
      "Acesso exclusivo",
    );
    expect(f.worker).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  },
);
it("pausa com ator autenticado sem depender do WhatsApp ou da loja estarem disponíveis", async () => {
  expect(await executar(configurarRecuperacaoMimo, { ativo: false, ator: "forjado" })).toEqual({
    ativo: false,
  });
  expect(f.rpc).toHaveBeenCalledWith("mimo_recuperacao_pausar", {
    _empresa: "empresa",
    _ator: "ator-verificado",
  });
  expect(f.config).not.toHaveBeenCalled();
});
it("envio manual usa somente a identidade autenticada e o carrinho selecionado", async () => {
  f.worker.mockResolvedValue("enviada");
  expect(
    await executar(enviarLembreteManualMimo, { checkout: "42", ator: "forjado", empresa: "outra" }),
  ).toEqual({ resultado: "enviada" });
  expect(f.worker).toHaveBeenCalledExactlyOnceWith({
    empresa: "empresa",
    ator: "ator-verificado",
    checkout: "42",
  });
});
it("envio manual não revela erros internos nem repete uma falha de transporte", async () => {
  f.worker.mockRejectedValue(Error("segredo-provedor"));
  await expect(executar(enviarLembreteManualMimo, { checkout: "42" })).rejects.toThrow(
    "Atualize o carrinho",
  );
  expect(f.worker).toHaveBeenCalledTimes(1);
});
it("migração indisponível mostra preparação, sem ativar envios", async () => {
  f.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  expect(await executar(obterIndicadoresRecuperacaoMimo)).toBeNull();
});
it("não expõe corpo do banco em falhas de consulta", async () => {
  f.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "detalhe-privado" } });
  await expect(executar(obterIndicadoresRecuperacaoMimo)).rejects.toThrow(
    "Não foi possível consultar",
  );
});
it("ativação exige configuração de loja válida", async () => {
  f.config.mockReturnValue(null);
  await expect(executar(configurarRecuperacaoMimo, { ativo: true })).rejects.toThrow(
    "loja precisa ser configurada",
  );
  expect(f.rpc).not.toHaveBeenCalled();
});
