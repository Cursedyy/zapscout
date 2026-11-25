import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { atenderCodex, configCodex, CODEX_MODEL } from "./mimo-codex.server";
const f = vi.hoisted(() => ({
  claims: vi.fn(),
  acesso: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: f.create }));
vi.mock("./mimo-leads.server", () => ({ exigirMimo: f.acesso }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: f.rpc } }));
const encoder = new TextEncoder();
const delta = 'data: {"type":"response.output_text.delta","delta":"ação"}\r\n\r\n';
const done = 'data: {"type":"response.completed","response":{"status":"completed"}}\r\n\r\n';
function upstream(texto = delta + done) {
  const bytes = encoder.encode(texto);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let n = 0; n < bytes.length; n += 3) c.enqueue(bytes.slice(n, n + 3));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
function request(
  data: unknown = { mode: "generate", prompt: "Crie uma função de soma." },
  signal?: AbortSignal,
  headers?: HeadersInit,
) {
  return new Request("https://mimo.example.invalid/api/mimo/codex", {
    method: "POST",
    headers: {
      Authorization: "Bearer jwt-sintetico",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(data),
    signal,
  });
}
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "segredo-openai-sintetico");
  vi.stubEnv("OPENAI_CODEX_MODEL", "");
  vi.stubEnv("SUPABASE_URL", "https://supabase.example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publica-sintetica");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "servico-sintetico");
  f.create.mockReturnValue({ auth: { getClaims: f.claims } });
  f.claims.mockResolvedValue({ data: { claims: { sub: "usuario-verificado" } }, error: null });
  f.acesso.mockResolvedValue({ empresaId: "empresa-verificada", papel: "gestor" });
  f.rpc.mockResolvedValue({ data: true, error: null });
  f.fetch.mockImplementation(async () => upstream());
  vi.stubGlobal("fetch", f.fetch);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("usa contrato Responses documentado, sem ferramentas, armazenamento ou cabeçalho beta", async () => {
  const r = await atenderCodex(request());
  const texto = await r.text();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(f.fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  const options = f.fetch.mock.calls[0][1] as RequestInit;
  expect(options.redirect).toBe("error");
  expect(new Headers(options.headers).get("authorization")).toBe("Bearer segredo-openai-sintetico");
  expect(new Headers(options.headers).has("OpenAI-Beta")).toBe(false);
  expect(JSON.parse(options.body as string)).toMatchObject({
    model: CODEX_MODEL,
    stream: true,
    store: false,
    tools: [],
    tool_choice: "none",
    max_output_tokens: 4096,
    reasoning: { effort: "low" },
  });
  expect(texto).toContain('"text":"ação"');
  expect(texto).toContain("event: complete");
  expect(texto).not.toContain("segredo");
  expect(texto).not.toContain("instructions");
  expect(f.rpc).toHaveBeenCalledWith("check_rate_limit", {
    _key: "mimo-codex:empresa-verificada:usuario-verificado",
    _max: 10,
    _window_secs: 3600,
  });
});
it("não duplica output_text.done nem transmite metadados", async () => {
  f.fetch.mockResolvedValue(
    upstream(
      'data: {"type":"response.created","response":{"instructions":"segredo"}}\n\n' +
        delta +
        'data: {"type":"response.output_text.done","text":"ação"}\n\n' +
        done,
    ),
  );
  const texto = await (await atenderCodex(request())).text();
  expect(texto.match(/ação/g)).toHaveLength(1);
  expect(texto).not.toContain("segredo");
});
it.each(["vendedor", "marketing", "administrativo"])("nega %s antes da API", async (papel) => {
  f.acesso.mockResolvedValue({ empresaId: "empresa-verificada", papel });
  expect((await atenderCodex(request())).status).toBe(403);
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
});
it("nega token inválido, associação revogada e origem diferente", async () => {
  f.claims.mockResolvedValueOnce({ data: null, error: { message: "jwt secreto" } });
  expect((await atenderCodex(request())).status).toBe(401);
  f.acesso.mockRejectedValueOnce(Error("interno"));
  expect((await atenderCodex(request())).status).toBe(403);
  expect(
    (await atenderCodex(request(undefined, undefined, { Origin: "https://outro.invalid" }))).status,
  ).toBe(403);
  expect(f.fetch).not.toHaveBeenCalled();
});
it("configuração ausente é segura e GET não inicia geração", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const get = new Request("https://mimo.example.invalid/api/mimo/codex", {
    headers: { Authorization: "Bearer jwt" },
  });
  expect(await (await atenderCodex(get)).json()).toEqual({ configurado: false });
  expect((await atenderCodex(request())).status).toBe(503);
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
  expect(
    configCodex({ OPENAI_API_KEY: "x", OPENAI_CODEX_MODEL: "modelo-nao-validado" }),
  ).toBeNull();
});
it("GET também exige sessão e papel; administrador só consulta configuração", async () => {
  const semToken = new Request("https://mimo.example.invalid/api/mimo/codex");
  expect((await atenderCodex(semToken)).status).toBe(401);
  f.acesso.mockResolvedValue({ empresaId: "empresa-verificada", papel: "administrador" });
  const r = await atenderCodex(
    new Request(semToken.url, { headers: { Authorization: "Bearer jwt" } }),
  );
  expect(await r.json()).toEqual({ configurado: true });
  expect(f.fetch).not.toHaveBeenCalled();
});
it("cancela leitura ativa quando a requisição é abortada", async () => {
  const cancel = vi.fn();
  f.fetch.mockResolvedValue(
    new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
  const ctrl = new AbortController();
  const r = await atenderCodex(request(undefined, ctrl.signal));
  const texto = r.text();
  ctrl.abort();
  expect(await texto).toContain("event: error");
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("recusa tipo divergente, UTF-8 inválido e saída acima do limite", async () => {
  const respostas = [
    upstream(
      'event: response.failed\ndata: {"type":"response.output_text.delta","delta":"x"}\n\n' + done,
    ),
    new Response(new Uint8Array([0xc3, 0x28]), {
      headers: { "Content-Type": "text/event-stream" },
    }),
    upstream(
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "x".repeat(32001) })}\n\n` +
        done,
    ),
  ];
  for (const resposta of respostas) {
    f.fetch.mockResolvedValueOnce(resposta);
    const texto = await (await atenderCodex(request())).text();
    expect(texto).toContain("event: error");
    expect(texto).not.toContain("event: complete");
  }
});
it("limite atingido retorna 429 e falha no limitador impede cobrança", async () => {
  f.rpc.mockResolvedValueOnce({ data: false, error: null });
  const r = await atenderCodex(request());
  expect(r.status).toBe(429);
  expect(r.headers.get("retry-after")).toBe("3600");
  f.rpc.mockResolvedValueOnce({ data: null, error: { message: "segredo" } });
  const indisponivel = await atenderCodex(request());
  expect(indisponivel.status).toBe(503);
  expect(await indisponivel.text()).not.toContain("segredo");
  expect(f.fetch).not.toHaveBeenCalled();
});
it.each([429, 500, 503, 401])(
  "oculta corpo de erro upstream %s sem retentativa",
  async (status) => {
    f.fetch.mockResolvedValue(new Response("segredo-openai-sintetico", { status }));
    const r = await atenderCodex(request());
    expect(r.status).toBe(status === 429 ? 429 : 502);
    expect(await r.text()).not.toContain("segredo");
    expect(f.fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  "data: {quebrado}\n\n",
  delta,
  'data: {"type":"response.failed","response":{"error":{"message":"segredo"}}}\n\n',
  'data: {"type":"response.output_text.delta","delta":12}\n\n',
  'data: {"type":"response.incomplete"}\n\n',
  'data: {"type":"response.output_text.delta","delta":"fim"}',
])("frame malformado/incompleto nunca vira sucesso %#", async (texto) => {
  f.fetch.mockResolvedValue(upstream(texto));
  const resposta = await (await atenderCodex(request())).text();
  expect(resposta).toContain("event: error");
  expect(resposta).not.toContain("event: complete");
  expect(resposta).not.toContain("segredo");
});
it("valida entrada estrita e tamanho antes de chamar upstream", async () => {
  expect(
    (await atenderCodex(request({ mode: "edit", prompt: "Altere este código." }))).status,
  ).toBe(400);
  expect(
    (await atenderCodex(request({ mode: "generate", prompt: "Crie uma função.", tools: [] })))
      .status,
  ).toBe(400);
  expect(
    (await atenderCodex(request({ mode: "generate", prompt: "x".repeat(140000) }))).status,
  ).toBe(413);
  expect(f.fetch).not.toHaveBeenCalled();
});
it("cancelar cliente cancela o upstream mesmo com leitura pendente", async () => {
  const cancel = vi.fn();
  f.fetch.mockResolvedValue(
    new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
  const r = await atenderCodex(request());
  const reader = r.body!.getReader();
  const leitura = reader.read();
  await reader.cancel();
  await leitura;
  expect((f.fetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("abort e timeout alcançam a requisição upstream antes dos cabeçalhos", async () => {
  vi.useFakeTimers();
  f.fetch.mockImplementation(
    (_url, options: RequestInit) =>
      new Promise((_resolve, reject) =>
        options.signal!.addEventListener("abort", () =>
          reject(new DOMException("Abort", "AbortError")),
        ),
      ),
  );
  const ctrl = new AbortController();
  const pendente = atenderCodex(request(undefined, ctrl.signal));
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
  ctrl.abort();
  expect((await pendente).status).toBe(499);
  const timeout = atenderCodex(request());
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
  await vi.advanceTimersByTimeAsync(90000);
  expect((await timeout).status).toBe(504);
});
