import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  configOAuthNuvem,
  cifrarTokenNuvem,
  decifrarTokenNuvem,
  callbackOAuthNuvem,
  COOKIE_NUVEM,
} from "./mimo-nuvemshop-oauth.server";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
const emp = "10000000-0000-4000-8000-000000000001",
  actor = "20000000-0000-4000-8000-000000000001";
const state = "a".repeat(64),
  origin = "https://mimo.example.invalid";
const request = (cookie = state, s = state) =>
  new Request(origin + "/api/public/nuvemshop-oauth?code=synthetic-code&state=" + s, {
    headers: { cookie: COOKIE_NUVEM + "=" + cookie },
  });
beforeEach(() => {
  vi.resetAllMocks();
  for (const [k, v] of Object.entries({
    MIMO_NUVEMSHOP_EMPRESA_ID: emp,
    MIMO_NUVEMSHOP_STORE_ID: "123",
    MIMO_NUVEMSHOP_USER_AGENT: "MiMo (test@example.invalid)",
    MIMO_NUVEMSHOP_CHECKOUT_HOSTS: "loja.example.invalid",
    MIMO_NUVEMSHOP_APP_ID: "456",
    MIMO_NUVEMSHOP_APP_SECRET: "segredo-sintetico-app",
    MIMO_NUVEMSHOP_TOKEN_KEY: "b".repeat(64),
    MIMO_NUVEMSHOP_ORIGIN: origin,
  }))
    vi.stubEnv(k, v);
  rpc.mockImplementation(async (nome: string) => ({
    data:
      nome === "mimo_nuvem_oauth_consumir"
        ? [{ empresa_id: emp, loja_id: "123", ator_id: actor }]
        : null,
    error: null,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("cifra com IV novo e vincula a credencial à empresa e à loja", async () => {
  const cfg = configOAuthNuvem()!,
    a = await cifrarTokenNuvem("token-sintetico-secreto", cfg),
    b = await cifrarTokenNuvem("token-sintetico-secreto", cfg);
  expect(a).not.toBe(b);
  expect(a).not.toContain("token-sintetico");
  expect(await decifrarTokenNuvem(a, cfg)).toBe("token-sintetico-secreto");
  await expect(decifrarTokenNuvem(a, { ...cfg, loja: "999" })).rejects.toThrow();
  await expect(decifrarTokenNuvem(a.slice(0, -2) + "00", cfg)).rejects.toThrow();
});
it("rejeita origem insegura ou com destino de redirecionamento embutido", () => {
  vi.stubEnv("MIMO_NUVEMSHOP_ORIGIN", "http://mimo.example.invalid");
  expect(configOAuthNuvem()).toBeNull();
  vi.stubEnv("MIMO_NUVEMSHOP_ORIGIN", origin + "/outra-pagina");
  expect(configOAuthNuvem()).toBeNull();
});
it("callback sem cookie correspondente não consome estado nem troca código", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const r = await callbackOAuthNuvem(request("b".repeat(64)));
  expect(r.headers.get("location")).toBe(origin + "/mimo/automacoes?conexao=falha");
  expect(rpc).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it("autorização reutilizada falha antes de acessar o provedor", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "used" } });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect((await callbackOAuthNuvem(request())).headers.get("location")).toContain("conexao=falha");
  expect(fetcher).not.toHaveBeenCalled();
});
it("troca código e salva somente token cifrado, sem expor segredo no redirecionamento", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "token-sintetico-secreto",
          user_id: 123,
          scope: "read_orders",
          token_type: "bearer",
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const r = await callbackOAuthNuvem(request());
  expect(r.headers.get("location")).toBe(origin + "/mimo/automacoes?conexao=sucesso");
  const [nome, args] = rpc.mock.calls[1];
  expect(nome).toBe("mimo_nuvem_oauth_salvar");
  expect(args).toMatchObject({ _empresa: emp, _loja: "123", _ator: actor });
  expect(args._cifrado).not.toContain("token-sintetico");
  expect(await decifrarTokenNuvem(args._cifrado, configOAuthNuvem()!)).toBe(
    "token-sintetico-secreto",
  );
  expect(fetcher.mock.calls[0][0]).toBe("https://www.nuvemshop.com.br/apps/authorize/token");
  expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
});
it.each([
  { user_id: 999, scope: "read_orders" },
  { user_id: 123, scope: "read_products" },
])("não persiste loja ou escopo divergente: %j", async (extra) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "token-sintetico-secreto",
            token_type: "bearer",
            ...extra,
          }),
        ),
      ),
  );
  expect((await callbackOAuthNuvem(request())).headers.get("location")).toContain("conexao=falha");
  expect(rpc).toHaveBeenCalledTimes(1);
});
