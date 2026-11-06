import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  sync: vi.fn(),
  acesso: vi.fn(),
  send: vi.fn(),
  compra: vi.fn(),
  coletar: vi.fn(),
  obter: vi.fn(),
  mime: vi.fn(),
}));
vi.mock("./mimo-email-db.server", () => ({ rpcEmail: f.rpc }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: f.from, rpc: f.sync },
}));
vi.mock("./mimo-gmail.server", async () => {
  const original =
    await vi.importActual<typeof import("./mimo-gmail.server")>("./mimo-gmail.server");
  return {
    ...original,
    configGmail: () => ({ empresa: "10000000-0000-4000-8000-000000000001" }),
    acessoGmail: f.acesso,
    enviarGmail: f.send,
    mimeGmail: f.mime,
    linkDescadastroGmail: async () =>
      "https://app.example.invalid/api/public/mimo-carrinhos-descadastro?id=sintetico",
  };
});
vi.mock("./mimo-nuvemshop-oauth.server", () => ({
  configOAuthNuvem: () => ({ empresa: "10000000-0000-4000-8000-000000000001", loja: "123" }),
  obterConfigNuvem: f.obter,
}));
vi.mock("./mimo-nuvemshop.server", () => ({
  coletarNuvem: f.coletar,
  conferirCompraNuvem: f.compra,
}));
import { executarEmailMimo } from "./mimo-email-worker.server";
const empresa = "10000000-0000-4000-8000-000000000001",
  ator = "20000000-0000-4000-8000-000000000001",
  id = "30000000-0000-4000-8000-000000000001",
  reserva = "40000000-0000-4000-8000-000000000001",
  versao = "50000000-0000-4000-8000-000000000001";
const trabalho = {
  id,
  reserva,
  checkout_id: "42",
  token_hash: "a".repeat(64),
  email: "cliente@example.invalid",
};
beforeEach(() => {
  vi.resetAllMocks();
  f.rpc.mockImplementation(async (nome: string) =>
    nome === "mimo_email_processamento"
      ? { ator, loja: "123" }
      : nome === "mimo_email_reservar"
        ? trabalho
        : nome === "mimo_email_autorizar"
          ? true
          : {},
  );
  f.obter.mockResolvedValue({ empresa, loja: "123", hosts: ["loja.example.invalid"] });
  f.coletar.mockResolvedValue({ carrinhos: [], pedidos: [] });
  f.sync.mockResolvedValue({ error: null });
  f.acesso.mockResolvedValue({
    cfg: { remetente: "remetente@example.invalid", origem: "https://app.example.invalid" },
    token: "token-sintetico",
    versao,
  });
  f.compra.mockResolvedValue(false);
  f.send.mockResolvedValue("gmail-id-sintetico");
  f.mime.mockReturnValue("raw-sintetico");
  f.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({
        error: null,
        data: {
          ...trabalho,
          nome: "Sintético",
          url: "https://loja.example.invalid/checkout/sintetico",
        },
      }),
    };
    return q;
  });
});
it("sincroniza, verifica compra e autoriza antes de enviar; mensagem inclui descadastro", async () => {
  expect(await executarEmailMimo()).toBe("enviada");
  expect(f.compra).toHaveBeenCalledWith(expect.anything(), trabalho.token_hash);
  expect(f.mime).toHaveBeenCalledWith(
    expect.objectContaining({
      destino: trabalho.email,
      descadastro: expect.stringContaining("/mimo-carrinhos-descadastro"),
    }),
  );
  expect(f.rpc).toHaveBeenCalledWith("mimo_email_autorizar", {
    _id: id,
    _reserva: reserva,
    _versao: versao,
  });
  expect(f.send).toHaveBeenCalledExactlyOnceWith("token-sintetico", "raw-sintetico");
});
it("manual reserva somente o carrinho e ator selecionados", async () => {
  expect(await executarEmailMimo({ empresa, ator, checkout: "42" })).toBe("enviada");
  expect(f.rpc).toHaveBeenCalledWith("mimo_email_reservar", {
    _empresa: empresa,
    _loja: "123",
    _ator: ator,
    _checkout: "42",
  });
});
it("compra canônica bloqueia o e-mail", async () => {
  f.compra.mockResolvedValue(true);
  expect(await executarEmailMimo()).toBe("bloqueada");
  expect(f.send).not.toHaveBeenCalled();
  expect(f.rpc).toHaveBeenCalledWith(
    "mimo_email_concluir",
    expect.objectContaining({ _estado: "bloqueada", _motivo: "compra_identificada" }),
  );
});
it("sincronização falha antes de reservar", async () => {
  f.coletar.mockRejectedValue(Error("API indisponível"));
  await expect(executarEmailMimo()).rejects.toThrow();
  expect(f.rpc.mock.calls.some(([n]) => n === "mimo_email_reservar")).toBe(false);
  expect(f.send).not.toHaveBeenCalled();
});
it("consulta de compra indisponível impede enviar", async () => {
  f.compra.mockRejectedValue(Error("API indisponível"));
  await expect(executarEmailMimo()).rejects.toThrow();
  expect(f.send).not.toHaveBeenCalled();
});
it("troca de remetente ou credencial inválida impede enviar", async () => {
  f.acesso.mockRejectedValue(Error("Remetente divergente"));
  await expect(executarEmailMimo()).rejects.toThrow();
  expect(f.send).not.toHaveBeenCalled();
});
it("autorização final revogada impede enviar", async () => {
  f.rpc.mockImplementation(async (n: string) =>
    n === "mimo_email_processamento"
      ? { ator, loja: "123" }
      : n === "mimo_email_reservar"
        ? trabalho
        : n === "mimo_email_autorizar"
          ? false
          : {},
  );
  expect(await executarEmailMimo()).toBe("bloqueada");
  expect(f.send).not.toHaveBeenCalled();
});
it("falha após autorização fica incerta, sem repetir", async () => {
  f.send.mockRejectedValue(Error("timeout"));
  expect(await executarEmailMimo()).toBe("incerta");
  expect(f.send).toHaveBeenCalledTimes(1);
  expect(f.rpc).toHaveBeenCalledWith(
    "mimo_email_concluir",
    expect.objectContaining({ _estado: "incerta" }),
  );
});
