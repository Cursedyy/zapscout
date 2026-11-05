import { it, expect, vi } from "vitest";
import {
  configNuvem,
  lerPaginasNuvem,
  normalizarCheckout,
  normalizarPedido,
  coletarNuvem,
  type ConfigNuvem,
} from "./mimo-nuvemshop.server";
import { centavosNuvem, situacaoCarrinho, linkCarrinhoSeguro } from "./mimo-carrinhos";
const cfg: ConfigNuvem = {
  empresa: "10000000-0000-4000-8000-000000000001",
  loja: "123",
  token: "segredo-sintetico",
  agente: "MiMo (teste@example.invalid)",
  hosts: ["loja.example.invalid"],
};
const checkout = {
  id: 42,
  store_id: 123,
  token: "token-sintetico-checkout",
  total: "123.45",
  currency: "BRL",
  created_at: "2026-11-01T12:00:00+0000",
  updated_at: "2026-11-02T12:00:00+0000",
  contact_name: "Cliente sintético",
  contact_email: "cliente@example.invalid",
  contact_phone: "+55 (11) 99999-9999",
  abandoned_checkout_url: "https://loja.example.invalid/checkout/token",
  products: [{ name: "Produto sintético", quantity: 2 }],
  contact_identification: "dado-nao-deve-ser-retido",
  shipping_address: "nao-reter",
};
const order = { ...checkout, number: 100, status: "open", payment_status: "paid" };
it("normaliza centavos sem arredondamento e descarta dados excessivos", async () => {
  expect(centavosNuvem("0.01")).toBe(1);
  expect(centavosNuvem("123.4")).toBe(12340);
  for (const n of ["1.234", "-1.00", "1e3", 1.2]) expect(() => centavosNuvem(n)).toThrow();
  const c = await normalizarCheckout(checkout, cfg);
  expect(c.total).toBe(12345);
  expect(c.token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(c).not.toHaveProperty("token");
  expect(c).not.toHaveProperty("contact_identification");
  expect(c).not.toHaveProperty("shipping_address");
  expect(c.telefone).toBe("+5511999999999");
  expect(c.origem_updated_at).toBe("2026-11-02T12:00:00.000Z");
});
it("bloqueia loja divergente e links fora dos domínios configurados", async () => {
  await expect(normalizarCheckout({ ...checkout, store_id: 456 }, cfg)).rejects.toThrow(
    "Loja divergente",
  );
  for (const url of [
    "https://loja.example.invalid.evil.test/checkout/x",
    "javascript:alert(1)",
    "https://a:b@loja.example.invalid/checkout/x",
    "http://loja.example.invalid/checkout/x",
    "https://loja.example.invalid/admin",
  ])
    expect(linkCarrinhoSeguro(url, cfg.hosts)).toBeNull();
  expect(
    await normalizarCheckout({ ...checkout, contact_email: "inválido", contact_phone: "abc" }, cfg),
  ).toMatchObject({ email: "", telefone: "" });
});
it("separa pedido criado, pagamento, cancelamento e ausência de contato", async () => {
  const c = await normalizarCheckout(checkout, cfg),
    p = await normalizarPedido(order, cfg);
  expect(p.token_hash).toBe(c.token_hash);
  expect(situacaoCarrinho(c, p)).toBe("Pagamento confirmado");
  expect(situacaoCarrinho(c, { ...p, pagamento: "pending" })).toBe("Compra identificada");
  expect(situacaoCarrinho(c, { ...p, status: "cancelled" })).toBe("Pedido cancelado");
  expect(situacaoCarrinho(c, { ...p, pagamento: "refunded" })).toBe("Pagamento estornado");
  expect(situacaoCarrinho({ email: "", telefone: "" })).toBe("Sem contato");
});
it("configuração exige vínculo explícito e nunca usa domínios arbitrários", () => {
  expect(configNuvem({})).toBeNull();
  expect(
    configNuvem({
      MIMO_NUVEMSHOP_EMPRESA_ID: cfg.empresa,
      MIMO_NUVEMSHOP_STORE_ID: cfg.loja,
      MIMO_NUVEMSHOP_ACCESS_TOKEN: cfg.token,
      MIMO_NUVEMSHOP_USER_AGENT: cfg.agente,
      MIMO_NUVEMSHOP_CHECKOUT_HOSTS: "https://evil.test",
    }),
  ).toBeNull();
});
it("pagina os carrinhos com credencial somente no host fixo da API", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(Array(100).fill(checkout))))
    .mockResolvedValueOnce(new Response("[]"));
  expect(await lerPaginasNuvem(cfg, "checkouts", f)).toHaveLength(100);
  expect(new URL(String(f.mock.calls[1][0])).searchParams.get("page")).toBe("2");
  expect(new URL(String(f.mock.calls[0][0])).host).toBe("api.tiendanube.com");
  expect(f.mock.calls[0][1]).toMatchObject({
    redirect: "manual",
    headers: { Authorization: "Bearer segredo-sintetico" },
  });
});
it.each([401, 403, 429, 500])("não conclui sincronização com resposta HTTP %s", async (status) => {
  const f = vi.fn().mockResolvedValue(new Response("não expor conteúdo sensível", { status }));
  await expect(coletarNuvem(cfg, f)).rejects.toThrow();
});
it("rejeita lote de carrinhos inválido antes de qualquer gravação", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{ ...checkout, total: "1e5" }])))
    .mockResolvedValueOnce(new Response("[]"));
  await expect(coletarNuvem(cfg, f)).rejects.toThrow("Nenhuma sincronização foi gravada");
});

it("segue redirecionamento somente entre aliases oficiais para o mesmo recurso e filtros", async () => {
  const f = vi
    .fn()
    .mockImplementationOnce(async (url: URL) => {
      const next = new URL(url);
      next.hostname = "api.nuvemshop.com.br";
      return new Response(null, { status: 307, headers: { location: next.href } });
    })
    .mockResolvedValueOnce(new Response("[]"));
  expect(await lerPaginasNuvem(cfg, "checkouts", f)).toEqual([]);
  expect(new URL(String(f.mock.calls[1][0])).host).toBe("api.nuvemshop.com.br");
  expect(f.mock.calls[1][1].headers.Authorization).toBe("Bearer segredo-sintetico");
});
it.each(["host", "store", "query", "http", "credentials"])(
  "bloqueia redirecionamento da API que altera %s antes de enviar token",
  async (change) => {
    const f = vi.fn().mockImplementation(async (url: URL) => {
      const next = new URL(url);
      if (change === "host") next.hostname = "evil.example.invalid";
      if (change === "store") next.pathname = next.pathname.replace("/123/", "/999/");
      if (change === "query") next.search = "";
      if (change === "http") next.protocol = "http:";
      if (change === "credentials") next.username = "user";
      return new Response(null, { status: 302, headers: { location: next.href } });
    });
    await expect(lerPaginasNuvem(cfg, "checkouts", f)).rejects.toThrow(
      "Redirecionamento inesperado",
    );
    expect(f).toHaveBeenCalledTimes(1);
  },
);
it("usa o alias oficial após falha de rede sem alterar loja ou filtros", async () => {
  const f = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(new Response("[]"));
  expect(await lerPaginasNuvem(cfg, "checkouts", f)).toEqual([]);
  const first = new URL(String(f.mock.calls[0][0])),
    second = new URL(String(f.mock.calls[1][0]));
  expect(second.host).toBe("api.nuvemshop.com.br");
  expect(second.pathname + second.search).toBe(first.pathname + first.search);
  expect(f).toHaveBeenCalledTimes(2);
});
it("não repete consulta após erro HTTP de autenticação", async () => {
  const f = vi.fn().mockResolvedValue(new Response("private", { status: 401 }));
  await expect(lerPaginasNuvem(cfg, "orders", f)).rejects.toThrow("autorização");
  expect(f).toHaveBeenCalledTimes(1);
});
it("limita falhas de rede e não reproduz detalhes sensíveis", async () => {
  const f = vi.fn().mockRejectedValue(new TypeError("segredo-sintetico"));
  await expect(lerPaginasNuvem(cfg, "checkouts", f)).rejects.toThrow("comunicação da hospedagem");
  expect(f).toHaveBeenCalledTimes(2);
});
it("limita ciclos de redirecionamento da API", async () => {
  const f = vi
    .fn()
    .mockImplementation(
      async (url: URL) => new Response(null, { status: 307, headers: { location: String(url) } }),
    );
  await expect(lerPaginasNuvem(cfg, "checkouts", f)).rejects.toThrow("Redirecionamento inesperado");
  expect(f).toHaveBeenCalledTimes(3);
});
