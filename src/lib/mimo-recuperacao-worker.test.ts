import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  config: vi.fn(),
  obter: vi.fn(),
  coletar: vi.fn(),
  compra: vi.fn(),
  status: vi.fn(),
  enviar: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: f.from, rpc: f.rpc },
}));
vi.mock("./mimo-nuvemshop-oauth.server", () => ({
  configOAuthNuvem: f.config,
  obterConfigNuvem: f.obter,
}));
vi.mock("./mimo-nuvemshop.server", () => ({
  coletarNuvem: f.coletar,
  conferirCompraNuvem: f.compra,
}));
vi.mock("./uazapi.server", () => ({ uazStatus: f.status, uazSendText: f.enviar }));
vi.mock("./mimo-whatsapp", () => ({
  hashTokenMimo: async () => "hash-sintetico",
  numeroConectadoMimo: (v: string) => v,
}));
import { executarRecuperacaoMimo } from "./mimo-recuperacao-worker.server";
const manual = { empresa: "empresa", ator: "gestor-verificado", checkout: "42" };
const cfg = {
  empresa_id: "empresa",
  loja_id: "123",
  ator_id: "ativador",
  ativo: false,
  vinculo_id: "vinculo",
};
const tarefa = {
  id: "fila",
  reserva: "reserva",
  checkout_id: "42",
  token_hash: "checkout-hash",
  telefone: "5511999999999",
  empresa_id: "empresa",
  loja_id: "123",
};
beforeEach(() => {
  vi.resetAllMocks();
  f.config.mockReturnValue({ empresa: "empresa", loja: "123" });
  f.obter.mockResolvedValue({ empresa: "empresa", loja: "123", hosts: ["loja.example.invalid"] });
  f.coletar.mockResolvedValue({ carrinhos: [], pedidos: [] });
  f.compra.mockResolvedValue(false);
  f.status.mockResolvedValue({ status: "connected", profileNumber: "5511888888888" });
  f.enviar.mockResolvedValue({ id: "mensagem-sintetica" });
  f.rpc.mockImplementation(async (nome: string) => ({
    error: null,
    data:
      nome === "mimo_recuperacao_reservar_manual"
        ? [tarefa]
        : nome === "mimo_recuperacao_autorizar"
          ? true
          : null,
  }));
  f.from.mockImplementation((tabela: string) => {
    const row =
      tabela === "mimo_recuperacao_config"
        ? cfg
        : tabela === "mimo_whatsapp_vinculos"
          ? {
              id: "vinculo",
              owner_id: "dono",
              token_sha256: "hash-sintetico",
              numero_comercial: "5511888888888",
            }
          : tabela === "mimo_nuvem_carrinhos"
            ? {
                ...tarefa,
                url: "https://loja.example.invalid/checkout/sintetico",
                nome: "Sintético",
              }
            : {
                uazapi_instance_token: "token-sintetico",
                wa_provider: "uazapi",
                wa_method: "qrcode",
              };
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) q[method] = () => q;
    q.single = q.maybeSingle = async () => ({ data: row, error: null });
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null, data: tabela === "profiles" ? [{ id: "dono" }] : [] }).then(
        resolve,
      );
    return q;
  });
});
it("manual funciona com automação pausada e reserva apenas o checkout selecionado", async () => {
  expect(await executarRecuperacaoMimo(manual)).toBe("enviada");
  expect(f.obter).toHaveBeenCalledWith("empresa", "gestor-verificado");
  expect(f.rpc).toHaveBeenCalledWith("mimo_recuperacao_reservar_manual", {
    _empresa: "empresa",
    _loja: "123",
    _ator: "gestor-verificado",
    _checkout: "42",
  });
  expect(f.rpc.mock.calls.some(([nome]) => nome === "mimo_recuperacao_reservar")).toBe(false);
  expect(f.compra).toHaveBeenCalledWith(expect.anything(), "checkout-hash");
  expect(f.enviar).toHaveBeenCalledExactlyOnceWith(
    "token-sintetico",
    "5511999999999",
    expect.stringContaining("MIMOCONSULTOR"),
  );
});
it("automático pausado não sincroniza nem reserva", async () => {
  expect(await executarRecuperacaoMimo()).toBe("desativada");
  expect(f.rpc).not.toHaveBeenCalled();
  expect(f.enviar).not.toHaveBeenCalled();
});
it("manual bloqueia compra encontrada na reconsulta canônica", async () => {
  f.compra.mockResolvedValue(true);
  expect(await executarRecuperacaoMimo(manual)).toBe("bloqueada");
  expect(f.enviar).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledWith(
    "mimo_recuperacao_concluir",
    expect.objectContaining({ _estado: "bloqueada", _motivo: "compra_identificada" }),
  );
});
it("falha na consulta canônica nunca envia", async () => {
  f.compra.mockRejectedValue(Error("API indisponível"));
  await expect(executarRecuperacaoMimo(manual)).rejects.toThrow("API indisponível");
  expect(f.enviar).not.toHaveBeenCalled();
});
it("aceite ambíguo permanece incerto sem repetir o envio", async () => {
  f.enviar.mockRejectedValue(Error("timeout"));
  expect(await executarRecuperacaoMimo(manual)).toBe("incerta");
  expect(f.enviar).toHaveBeenCalledTimes(1);
  expect(f.rpc).toHaveBeenCalledWith(
    "mimo_recuperacao_concluir",
    expect.objectContaining({ _estado: "incerta" }),
  );
});
