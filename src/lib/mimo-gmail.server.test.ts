import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./mimo-email-db.server", () => ({ rpcEmail: f.rpc }));
vi.mock("./mimo-nuvemshop-oauth.server", () => ({
  configOAuthNuvem: () => ({ empresa: "10000000-0000-4000-8000-000000000001", loja: "123" }),
}));
import {
  configGmail,
  cifrarGmail,
  decifrarGmail,
  iniciarGmail,
  trocarCodigoGmail,
  callbackGmail,
  mimeGmail,
  enviarGmail,
  linkDescadastroGmail,
  tratarDescadastroGmail,
  COOKIE_GMAIL,
  ESCOPO_GMAIL,
} from "./mimo-gmail.server";
const empresa = "10000000-0000-4000-8000-000000000001",
  ator = "20000000-0000-4000-8000-000000000001",
  fila = "30000000-0000-4000-8000-000000000001";
const env = {
  MIMO_GMAIL_EMPRESA_ID: empresa,
  MIMO_GMAIL_ORIGIN: "https://app.example.invalid",
  MIMO_GMAIL_SENDER: "remetente@example.invalid",
  MIMO_GMAIL_CLIENT_ID: "sintetico.apps.googleusercontent.com",
  MIMO_GMAIL_CLIENT_SECRET: "segredo-sintetico",
  MIMO_GMAIL_TOKEN_KEY: "a".repeat(64),
  MIMO_GMAIL_UNSUBSCRIBE_KEY: "b".repeat(64),
};
const cfg = configGmail(env)!;
beforeEach(() => {
  vi.resetAllMocks();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  f.rpc.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const identidade = { sub: "google-sintetico", email: cfg.remetente, email_verified: true };
const tokens = {
  access_token: "access-sintetico",
  refresh_token: "refresh-sintetico",
  token_type: "Bearer",
  scope: `openid email ${ESCOPO_GMAIL}`,
};
it("configuração exige HTTPS, origem exata, remetente válido e chaves separadas", () => {
  expect(configGmail(env)).toMatchObject({ empresa, origem: cfg.origem });
  expect(configGmail({ ...env, MIMO_GMAIL_ORIGIN: "http://app.example.invalid" })).toBeNull();
  expect(configGmail({ ...env, MIMO_GMAIL_ORIGIN: cfg.origem + "/subpath" })).toBeNull();
  expect(
    configGmail({
      ...env,
      MIMO_GMAIL_SENDER: "remetente@example.invalid\r\nBcc: outro@example.invalid",
    }),
  ).toBeNull();
  expect(configGmail({ ...env, MIMO_GMAIL_UNSUBSCRIBE_KEY: "" })).toBeNull();
});
it("cifra vincula refresh à empresa, remetente e finalidade", async () => {
  const c = await cifrarGmail("refresh-sintetico", cfg);
  expect(c).not.toContain("refresh-sintetico");
  expect(await decifrarGmail(c, cfg)).toBe("refresh-sintetico");
  await expect(decifrarGmail(c, { ...cfg, empresa: ator })).rejects.toThrow();
  await expect(decifrarGmail(c, { ...cfg, remetente: "outro@example.invalid" })).rejects.toThrow();
  await expect(decifrarGmail(c, cfg, "pkce:outro")).rejects.toThrow();
});
it("início solicita apenas envio e identidade, offline e PKCE; guarda somente hash/cifra", async () => {
  const r = await iniciarGmail(empresa, ator),
    u = new URL(r.url);
  expect(u.origin).toBe("https://accounts.google.com");
  expect(u.searchParams.get("scope")).toBe(`openid email ${ESCOPO_GMAIL}`);
  expect(u.searchParams.get("access_type")).toBe("offline");
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  expect(f.rpc).toHaveBeenCalledWith(
    "mimo_email_oauth_iniciar",
    expect.objectContaining({
      _empresa: empresa,
      _ator: ator,
      _hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      _verificador: expect.stringMatching(/^v1:/),
    }),
  );
  expect(JSON.stringify(f.rpc.mock.calls)).not.toContain(r.state);
});
it("troca o código no endpoint fixo e verifica o remetente no Google", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(tokens))
    .mockResolvedValueOnce(Response.json(identidade));
  expect(
    await trocarCodigoGmail("codigo-sintetico", "verificador-sintetico", cfg, fetcher),
  ).toMatchObject({ refresh: "refresh-sintetico", identidade });
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    "https://oauth2.googleapis.com/token",
    expect.objectContaining({ redirect: "error", method: "POST" }),
  );
  expect(fetcher.mock.calls[0][1].body.get("code_verifier")).toBe("verificador-sintetico");
});
it.each([
  { ...identidade, email: "outro@example.invalid" },
  { ...identidade, email_verified: false },
])("recusa identidade diferente ou e-mail não verificado", async (r) => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(tokens))
    .mockResolvedValueOnce(Response.json(r));
  await expect(trocarCodigoGmail("codigo", "verificador", cfg, fetcher)).rejects.toThrow();
});
it("não prossegue sem gmail.send", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ...tokens, scope: "openid email" }));
  await expect(trocarCodigoGmail("codigo", "verificador", cfg, fetcher)).rejects.toThrow(
    "permissão de enviar e-mails",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("callback sem cookie, de outra origem ou com replay não libera estados", async () => {
  const state = "c".repeat(64);
  await callbackGmail(
    new Request(cfg.origem + `/api/public/mimo-gmail-oauth?state=${state}&code=teste`),
  );
  expect(f.rpc).not.toHaveBeenCalled();
  f.rpc.mockRejectedValue(Error("estado usado"));
  const r = await callbackGmail(
    new Request(cfg.origem + `/api/public/mimo-gmail-oauth?state=${state}&code=teste`, {
      headers: { cookie: `${COOKIE_GMAIL}=${state}` },
    }),
  );
  expect(r.status).toBe(303);
  expect(r.headers.get("location")).toContain("gmail=falha");
  expect(f.rpc).toHaveBeenCalledTimes(1);
});
it("falha após consumir encerra somente aquela tentativa", async () => {
  const state = "c".repeat(64);
  f.rpc
    .mockResolvedValueOnce({ empresa, ator, verificador: "cifra-invalida" })
    .mockResolvedValue({});
  await callbackGmail(
    new Request(cfg.origem + `/api/public/mimo-gmail-oauth?state=${state}&code=teste`, {
      headers: { cookie: `${COOKIE_GMAIL}=${state}` },
    }),
  );
  expect(f.rpc).toHaveBeenLastCalledWith("mimo_email_oauth_falhar", {
    _empresa: empresa,
    _ator: ator,
    _hash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(f.rpc.mock.calls.some(([n]) => n === "mimo_email_oauth_salvar")).toBe(false);
});
it("MIME contém texto/HTML em UTF-8, remetente e descadastro, sem injeção de cabeçalho", () => {
  const raw = mimeGmail({
    id: fila,
    remetente: cfg.remetente,
    destino: "cliente@example.invalid",
    assunto: "Olá 🧡",
    texto: "Olá!",
    html: "<p>Olá!</p>",
    descadastro: cfg.origem + "/api/public/mimo-carrinhos-descadastro?id=teste",
  });
  const mime = atob(raw.replaceAll("-", "+").replaceAll("_", "/"));
  expect(mime).toContain("From: MiMo <remetente@example.invalid>");
  expect(mime).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  expect(mime).toContain("text/plain; charset=UTF-8");
  expect(mime).toContain("text/html; charset=UTF-8");
  expect(() =>
    mimeGmail({
      id: fila,
      remetente: cfg.remetente,
      destino: "cliente@example.invalid\r\nBcc:outro@example.invalid",
      assunto: "Teste",
      texto: "",
      html: "",
    }),
  ).toThrow();
});
it("falha do provedor não é repetida nem revela seu corpo", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("segredo-provedor", { status: 500 }));
  await expect(enviarGmail("sintetico", "raw", fetcher)).rejects.toThrow("Google não concluiu");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("GET de descadastro só confirma; POST válido suprime sem expor o e-mail", async () => {
  f.rpc.mockResolvedValue({ empresa, email: "cliente@example.invalid" });
  const url = await linkDescadastroGmail(cfg, {
    id: fila,
    empresa,
    email: "cliente@example.invalid",
  });
  expect(url).not.toContain("cliente");
  const get = await tratarDescadastroGmail(new Request(url));
  expect(get.status).toBe(200);
  expect(await get.text()).not.toContain("cliente@example.invalid");
  expect(f.rpc.mock.calls.some(([n]) => n === "mimo_email_descadastrar")).toBe(false);
  const post = await tratarDescadastroGmail(new Request(url, { method: "POST" }));
  expect(post.status).toBe(200);
  expect(f.rpc).toHaveBeenLastCalledWith("mimo_email_descadastrar", { _id: fila });
});
it("assinatura adulterada não permite descadastro", async () => {
  f.rpc.mockResolvedValue({ empresa, email: "cliente@example.invalid" });
  const u = new URL(
    await linkDescadastroGmail(cfg, { id: fila, empresa, email: "cliente@example.invalid" }),
  );
  u.searchParams.set("assinatura", "0".repeat(64));
  expect((await tratarDescadastroGmail(new Request(u, { method: "POST" }))).status).toBe(400);
  expect(f.rpc.mock.calls.some(([n]) => n === "mimo_email_descadastrar")).toBe(false);
});
it("descadastro continua válido com OAuth desconectado",async()=>{
 f.rpc.mockResolvedValue({empresa,email:"cliente@example.invalid"});
 const url=await linkDescadastroGmail(cfg,{id:fila,empresa,email:"cliente@example.invalid"});
 vi.stubEnv("MIMO_GMAIL_CLIENT_ID","");vi.stubEnv("MIMO_GMAIL_CLIENT_SECRET","");
 expect((await tratarDescadastroGmail(new Request(url,{method:"POST"}))).status).toBe(200);
 expect(f.rpc).toHaveBeenLastCalledWith("mimo_email_descadastrar",{_id:fila});
});
it("assunto longo é dobrado em palavras UTF-8 válidas de no máximo 75 caracteres",()=>{
 const assunto="[TESTE INTERNO MiMo] Olá! Seu carrinho merece um mimo: 10% de desconto 🧡";
 const raw=mimeGmail({id:fila,remetente:cfg.remetente,destino:"cliente@example.invalid",assunto,texto:"Teste",html:"<p>Teste</p>"});
 const mime=atob(raw.replaceAll("-","+").replaceAll("_","/"));
 const palavras=[...mime.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
 expect(palavras.length).toBeGreaterThan(1);
 expect(palavras.every(m=>m[0].length<=75)).toBe(true);
 expect(palavras.map(m=>new TextDecoder("utf-8",{fatal:true}).decode(Uint8Array.from(atob(m[1]),c=>c.charCodeAt(0)))).join("")).toBe(assunto);
});
