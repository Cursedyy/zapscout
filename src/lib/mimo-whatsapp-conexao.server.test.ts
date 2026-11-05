import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const exigir = vi.hoisted(() => vi.fn());
vi.mock("./mimo-leads.server", () => ({ exigirMimo: exigir }));
vi.mock("./whatsapp.functions", () => ({ publicWebhookUrl: () => "https://example.test/webhook" }));
import {
  servidorUazapiSeguro,
  qrSeguroMimo,
  mensagemFalhaConexaoMimo,
  acessoConexaoMimo,
  desafioNumeroMimo,
  verificarDesafioNumeroMimo,
  numeroConectado,
} from "./mimo-whatsapp-conexao.server";
beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "segredo-sintetico-apenas-local");
});
afterEach(() => vi.unstubAllEnvs());
describe("confirmação segura do WhatsApp comercial", () => {
  const agora = 100000000;
  it("aceita apenas a confirmação original dentro do prazo", () => {
    const d = desafioNumeroMimo("empresa", "usuario", "hash", "5511999999999", agora);
    expect(() =>
      verificarDesafioNumeroMimo(d, "empresa", "usuario", "hash", "5511999999999", agora + 1000),
    ).not.toThrow();
    expect(() =>
      verificarDesafioNumeroMimo(
        d,
        "empresa",
        "usuario",
        "hash",
        "5511999999999",
        agora + 11 * 60000,
      ),
    ).toThrow();
  });
  it.each([
    ["outra", "usuario", "hash", "5511999999999"],
    ["empresa", "outro", "hash", "5511999999999"],
    ["empresa", "usuario", "outro-token", "5511999999999"],
    ["empresa", "usuario", "hash", "5511888888888"],
  ])(
    "rejeita troca de empresa, ator, conexão ou número: %s %s %s %s",
    (empresa, usuario, hash, numero) => {
      const d = desafioNumeroMimo("empresa", "usuario", "hash", "5511999999999", agora);
      expect(() => verificarDesafioNumeroMimo(d, empresa, usuario, hash, numero, agora)).toThrow();
    },
  );
  it("não concede gestão da conexão a vendedor ou gestor", async () => {
    for (const papel of ["vendedor", "gestor", "marketing", "administrativo"]) {
      exigir.mockResolvedValueOnce({ empresaId: "empresa", papel });
      await expect(acessoConexaoMimo({ supabase: {} as any, userId: "usuario" })).rejects.toThrow(
        /administrador/,
      );
    }
  });
  it("normaliza identificação do aparelho sem aceitar telefone inválido", () => {
    expect(numeroConectado("5511999999999:12@s.whatsapp.net")).toBe("5511999999999");
    expect(numeroConectado("desconhecido")).toBeNull();
  });
});

import { UazApiError } from "./uazapi.server";

it("distingue credencial, rede e operação sem mostrar segredos", () => {
  expect(
    mensagemFalhaConexaoMimo(new UazApiError("http", "/instance/status", 401), "status"),
  ).toContain("HTTP 401");
  expect(mensagemFalhaConexaoMimo(new UazApiError("rede", "/webhook"), "webhook")).toContain(
    "UAZAPI_BASE_URL",
  );
  expect(mensagemFalhaConexaoMimo(new Error("segredo-privado"), "pareamento")).not.toContain(
    "segredo-privado",
  );
});
it("QR aceita apenas imagem base64 limitada, inclusive vinda do status", () => {
  expect(qrSeguroMimo("c3ludGhldGlj")).toBe("data:image/png;base64,c3ludGhldGlj");
  expect(qrSeguroMimo(null)).toBeNull();
  for (const qr of [
    "https://evil.example.invalid/image",
    "data:image/svg+xml;base64,abc",
    { code: "abc" },
    "a".repeat(1000001),
  ])
    expect(() => qrSeguroMimo(qr)).toThrow();
});

it("diagnóstico mostra somente origem sem usuário, senha, caminho, query ou fragmento", () => {
  expect(
    servidorUazapiSeguro(
      "https://usuario:segredo@servidor.example.invalid/token-no-caminho?token=privado#outro",
    ),
  ).toBe("https://servidor.example.invalid");
});
it("diagnóstico não reproduz configuração inválida nem esquemas de dados", () => {
  for (const valor of ["segredo-solto", "data:text/plain,privado", "javascript:privado", ""])
    expect(servidorUazapiSeguro(valor)).toBeNull();
});
