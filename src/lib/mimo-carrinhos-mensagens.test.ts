import { it, expect } from "vitest";
import { mensagensRecuperacaoMimo, emailRecuperacaoMimo } from "./mimo-carrinhos-mensagens";
const link = "https://loja.example.invalid/checkout/carrinho";
const hosts = ["loja.example.invalid"];
it("inclui cupom de 10% em ambos os canais sem criar urgência ou validade", () => {
  const m = mensagensRecuperacaoMimo("Maria Silva", link, hosts);
  expect(m.whatsapp).toContain("Olá, Maria!");
  for (const texto of [m.whatsapp, m.texto, emailRecuperacaoMimo(m, null)]) {
    expect(texto).toContain("MIMOCONSULTOR");
    expect(texto).toContain("10%");
    expect(texto).not.toMatch(/só hoje|expira|última chance/i);
  }
  expect(m.whatsapp).not.toContain("SAIR");
  expect(m.whatsapp).toContain(link);
  expect(m.texto).toContain(link);
  expect(emailRecuperacaoMimo(m, null)).toContain(link);
});
it("não aceita links externos e escapa dados no HTML", () => {
  expect(() =>
    mensagensRecuperacaoMimo("Cliente", "https://evil.example.invalid/checkout/x", hosts),
  ).toThrow();
  const m = mensagensRecuperacaoMimo("<script>alert(1)</script>", link, hosts);
  const h = emailRecuperacaoMimo(m, null);
  expect(h).not.toContain("<script>");
  expect(h).toContain("&lt;script&gt;");
});
it("prévia sinaliza que não produz descadastro nem autorização de envio", () => {
  expect(emailRecuperacaoMimo(mensagensRecuperacaoMimo("", link, hosts), null)).toContain(
    "link de descadastro será incluído",
  );
});
it("exige descadastro HTTPS no mesmo domínio da aplicação", () => {
  const m = mensagensRecuperacaoMimo("Cliente", link, hosts);
  expect(() =>
    emailRecuperacaoMimo(m, {
      url: "https://evil.example.invalid/api/public/mimo-carrinhos-descadastro",
      origem: "https://app.example.invalid",
    }),
  ).toThrow();
  expect(
    emailRecuperacaoMimo(m, {
      url: "https://app.example.invalid/api/public/mimo-carrinhos-descadastro?t=assinatura",
      origem: "https://app.example.invalid",
    }),
  ).toContain("Deixar de receber");
});

it("cada mensagem usa exclusivamente o link recebido para aquele carrinho", () => {
  const a = mensagensRecuperacaoMimo(
    "Ana",
    "https://loja.example.invalid/checkout/carrinho-a",
    hosts,
  );
  const b = mensagensRecuperacaoMimo(
    "Bia",
    "https://loja.example.invalid/checkout/carrinho-b",
    hosts,
  );
  expect(a.whatsapp).toContain("/checkout/carrinho-a");
  expect(a.whatsapp).not.toContain("/checkout/carrinho-b");
  expect(b.whatsapp).toContain("/checkout/carrinho-b");
  expect(b.whatsapp).not.toContain("/checkout/carrinho-a");
});
