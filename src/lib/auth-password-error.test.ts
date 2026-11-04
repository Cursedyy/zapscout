import { describe, expect, it } from "vitest";
import { mensagemErroSenha, senhaRecusada } from "./auth-password-error";
describe("mensagens da política de senha", () => {
  it("traduz exatamente o erro relatado sem exigir arbitrariamente 12 caracteres", () => {
    const message = mensagemErroSenha({
      message: "Password is known to be weak and easy to guess, please choose a different one",
    });
    expect(message).toContain("Mesmo com 8 ou mais caracteres");
    expect(message).toContain("Escolha outra senha exclusiva");
    expect(message).not.toContain("12");
  });
  it("explica exigência de comprimento informada pelo serviço", () => {
    expect(
      mensagemErroSenha({
        code: "weak_password",
        reasons: ["length"],
        message: "Password should be at least 10 characters",
      }),
    ).toBe("A senha precisa ter pelo menos 10 caracteres.");
  });
  it("explica os tipos de caracteres quando esse for o motivo", () => {
    expect(mensagemErroSenha({ code: "weak_password", reasons: ["characters"] })).toContain(
      "uma letra maiúscula, uma minúscula, um número e um símbolo",
    );
  });
  it("traduz bloqueio de senha conhecida com motivo estruturado", () => {
    expect(mensagemErroSenha({ name: "AuthWeakPasswordError", reasons: ["pwned"] })).toContain(
      "identificada como insegura",
    );
  });
  it("preserva erros que não são uma recusa da política de senha", () => {
    expect(senhaRecusada({ message: "Invalid token" })).toBe(false);
    expect(mensagemErroSenha({ message: "Seu link expirou." })).toBe("Seu link expirou.");
  });
});
