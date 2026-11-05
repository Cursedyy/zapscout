import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  configOAuthNuvem,
  cifrarTokenNuvem,
  decifrarTokenNuvem,
  callbackOAuthNuvem,
  COOKIE_NUVEM,
  iniciarOAuthNuvem,
  trocarCodigoNuvem,
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
  expect(r.headers.get("location")).toBe(
    origin + "/mimo/automacoes?conexao=falha&motivo=navegador",
  );
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
  const fetcher = vi.fn().mockResolvedValue(
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
  expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  expect(fetcher.mock.calls[0][1].headers["User-Agent"]).toBe("MiMo (test@example.invalid)");
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
});
it.each([
  { user_id: 999, scope: "read_orders", motivo: "loja_divergente" },
  { user_id: 123, scope: "read_products", motivo: "permissao_pedidos" },
])("não persiste loja ou escopo divergente: %j", async (extra) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "token-sintetico-secreto",
          token_type: "bearer",
          ...extra,
        }),
      ),
    ),
  );
  const location = (await callbackOAuthNuvem(request())).headers.get("location");
  expect(location).toContain("conexao=falha");
  expect(location).toContain("motivo=" + extra.motivo);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it("não expõe corpo do provedor ao recusar a troca do código", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("segredo-do-provedor", { status: 401 })),
  );
  const r = await callbackOAuthNuvem(request());
  expect(r.headers.get("location")).toBe(
    origin + "/mimo/automacoes?conexao=falha&motivo=codigo_recusado",
  );
  expect(r.headers.get("location")).not.toContain("segredo-do-provedor");
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("identifica falha ao persistir sem expor erro do banco", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "token-sintetico-secreto",
          user_id: 123,
          scope: "read_orders",
          token_type: "bearer",
        }),
      ),
    ),
  );
  rpc.mockImplementation(async (nome: string) =>
    nome === "mimo_nuvem_oauth_consumir"
      ? { data: [{ empresa_id: emp, loja_id: "123", ator_id: actor }], error: null }
      : { data: null, error: { message: "detalhe-interno" } },
  );
  expect((await callbackOAuthNuvem(request())).headers.get("location")).toBe(
    origin + "/mimo/automacoes?conexao=falha&motivo=gravar_credencial",
  );
});

it("explica a reserva temporária da tentativa anterior sem remover a trava", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "Uma autorização ainda está sendo processada" },
  });
  await expect(iniciarOAuthNuvem(emp, actor)).rejects.toThrow("até dez minutos");
});

it("preserva POST somente ao redirecionar para o endpoint oficial de tokens", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://www.tiendanube.com/apps/authorize/token" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "token-sintetico-secreto",
          user_id: 123,
          scope: "read_orders",
          token_type: "bearer",
        }),
      ),
    );
  expect(await trocarCodigoNuvem("codigo-sintetico", configOAuthNuvem()!, fetcher)).toBe(
    "token-sintetico-secreto",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe("https://www.tiendanube.com/apps/authorize/token");
  expect(fetcher.mock.calls[1][1].method).toBe("POST");
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
});
it.each([
  "https://evil.example.invalid/apps/authorize/token",
  "http://www.tiendanube.com/apps/authorize/token",
  "https://www.tiendanube.com/other",
  "https://www.tiendanube.com/apps/authorize/token?leak=1",
])("não envia credenciais ao destino de redirecionamento %s", async (location) => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 307, headers: { location } }));
  await expect(trocarCodigoNuvem("codigo", configOAuthNuvem()!, fetcher)).rejects.toMatchObject({
    motivo: "redirecionamento_provedor",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [403, "bloqueio_provedor"],
  [429, "limite_provedor"],
  [503, "provedor_indisponivel"],
])("distingue HTTP %s sem repetir troca nem expor resposta", async (status, motivo) => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("corpo-privado", { status: status as number }));
  await expect(trocarCodigoNuvem("codigo", configOAuthNuvem()!, fetcher)).rejects.toMatchObject({
    motivo,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("distingue erro de rede sem repetir código possivelmente consumido", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("detalhe-interno"));
  await expect(trocarCodigoNuvem("codigo", configOAuthNuvem()!, fetcher)).rejects.toMatchObject({
    motivo: "rede_provedor",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("limita o número de redirecionamentos oficiais", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: "https://www.tiendanube.com/apps/authorize/token" },
      }),
    );
  await expect(trocarCodigoNuvem("codigo", configOAuthNuvem()!, fetcher)).rejects.toMatchObject({
    motivo: "redirecionamento_provedor",
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
