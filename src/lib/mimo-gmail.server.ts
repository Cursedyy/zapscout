import { z } from "zod";
import { rpcEmail } from "./mimo-email-db.server";
import { MENSAGENS_GMAIL, type ResultadoGmail } from "./mimo-gmail-status";
export const COOKIE_GMAIL = "__Host-mimo_gmail_oauth";
export const COOKIE_RESULTADO_GMAIL = "__Host-mimo_gmail_resultado";
class FalhaGmail extends Error {
  constructor(readonly codigo: Exclude<ResultadoGmail, "sucesso">) {
    super(MENSAGENS_GMAIL[codigo]);
  }
}
export const CALLBACK_GMAIL = "/api/public/mimo-gmail-oauth";
export const ESCOPO_GMAIL = "https://www.googleapis.com/auth/gmail.send";
export const emailGmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email()
  .regex(/^[\x21-\x7e]+$/)
  .refine((v) => !/[<>"\\]/.test(v));
export function configGmail(env = process.env) {
  const r = z
    .object({
      empresa: z.string().uuid(),
      origem: z.string().url(),
      remetente: emailGmailSchema,
      clientId: z.string().regex(/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/),
      clientSecret: z.string().min(10),
      chave: z.string().regex(/^[a-fA-F0-9]{64}$/),
      chaveDescadastro: z.string().regex(/^[a-fA-F0-9]{64}$/),
    })
    .safeParse({
      empresa: env.MIMO_GMAIL_EMPRESA_ID ?? env.MIMO_NUVEMSHOP_EMPRESA_ID,
      origem: env.MIMO_GMAIL_ORIGIN ?? env.MIMO_NUVEMSHOP_ORIGIN,
      remetente: env.MIMO_GMAIL_SENDER,
      clientId: env.MIMO_GMAIL_CLIENT_ID,
      clientSecret: env.MIMO_GMAIL_CLIENT_SECRET,
      chave: env.MIMO_GMAIL_TOKEN_KEY,
      chaveDescadastro: env.MIMO_GMAIL_UNSUBSCRIBE_KEY,
    });
  if (!r.success || r.data.chave.toLowerCase() === r.data.chaveDescadastro.toLowerCase())
    return null;
  const u = new URL(r.data.origem);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    return null;
  return { ...r.data, origem: u.origin };
}
export type ConfigGmail = NonNullable<ReturnType<typeof configGmail>>;
export function configDescadastroGmail(env = process.env) {
  const r = z
    .object({
      empresa: z.string().uuid(),
      origem: z.string().url(),
      chaveDescadastro: z.string().regex(/^[a-fA-F0-9]{64}$/),
    })
    .safeParse({
      empresa: env.MIMO_GMAIL_EMPRESA_ID ?? env.MIMO_NUVEMSHOP_EMPRESA_ID,
      origem: env.MIMO_GMAIL_ORIGIN ?? env.MIMO_NUVEMSHOP_ORIGIN,
      chaveDescadastro: env.MIMO_GMAIL_UNSUBSCRIBE_KEY,
    });
  if (!r.success) return null;
  const u = new URL(r.data.origem);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    return null;
  return { ...r.data, origem: u.origin };
}
const hex = (b: Uint8Array) => [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
const bytes = (s: string) => {
  if (!/^(?:[a-fA-F0-9]{2})+$/.test(s)) throw Error("Credencial Gmail indisponível.");
  return Uint8Array.from(s.match(/../g)!, (v) => parseInt(v, 16));
};
export const aleatorioGmail = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hashGmail = async (s: string) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
function assuntoMime(s: string) {
  const partes: string[] = [];
  let atual = "";
  for (const caractere of s) {
    if (new TextEncoder().encode(atual + caractere).length > 42) {
      partes.push(atual);
      atual = caractere;
    } else atual += caractere;
  }
  if (atual) partes.push(atual);
  return partes.map((parte) => `=?UTF-8?B?${b64(parte)}?=`).join("\r\n ");
}
const url64 = (s: string) => s.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export async function cifrarGmail(valor: string, cfg: ConfigGmail, finalidade = "refresh") {
  const key = await crypto.subtle.importKey("raw", bytes(cfg.chave), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(
    `mimo-gmail-v1:${cfg.empresa}:${cfg.remetente}:${finalidade}`,
  );
  const cifra = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    new TextEncoder().encode(valor),
  );
  return `v1:${hex(iv)}:${hex(new Uint8Array(cifra))}`;
}
export async function decifrarGmail(valor: string, cfg: ConfigGmail, finalidade = "refresh") {
  const [v, iv, cifra, ...extra] = valor.split(":");
  if (v !== "v1" || iv?.length !== 24 || !cifra || extra.length)
    throw Error("Credencial Gmail indisponível.");
  const key = await crypto.subtle.importKey("raw", bytes(cfg.chave), "AES-GCM", false, ["decrypt"]);
  const aad = new TextEncoder().encode(
    `mimo-gmail-v1:${cfg.empresa}:${cfg.remetente}:${finalidade}`,
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv), additionalData: aad },
      key,
      bytes(cifra),
    ),
  );
}
async function jsonGoogle(url: string, init: RequestInit, fetcher = fetch) {
  const signal = AbortSignal.timeout(15000);
  let r: Response;
  try {
    r = await fetcher(url, { ...init, redirect: "error", signal });
  } catch {
    throw new FalhaGmail(signal.aborted ? "tempo_google" : "rede_google");
  }
  if (!r.ok) {
    // Nunca propagar error_description, corpo bruto, códigos OAuth ou credenciais.
    let codigo: Exclude<ResultadoGmail, "sucesso"> = "google_http";
    try {
      const body: unknown = await r.json();
      const e = z.object({ error: z.string() }).safeParse(body);
      if (
        e.success &&
        ["invalid_client", "invalid_grant", "unauthorized_client", "invalid_scope"].includes(
          e.data.error,
        )
      )
        codigo = e.data.error as typeof codigo;
    } catch {
      /* Falha sem corpo JSON mantém o motivo genérico. */
    }
    throw new FalhaGmail(codigo);
  }
  try {
    return (await r.json()) as unknown;
  } catch {
    throw new FalhaGmail("resposta_google");
  }
}
export async function identidadeGmail(token: string, cfg: ConfigGmail, fetcher = fetch) {
  const r = z
    .object({
      sub: z.string().min(1).max(255),
      email: emailGmailSchema,
      email_verified: z.literal(true),
    })
    .safeParse(
      await jsonGoogle(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${token}` } },
        fetcher,
      ),
    );
  if (!r.success) throw new FalhaGmail("identidade");
  if (r.data.email !== cfg.remetente) throw new FalhaGmail("remetente");
  return r.data;
}
export async function iniciarGmail(empresa: string, ator: string) {
  const cfg = configGmail();
  if (!cfg || cfg.empresa !== empresa)
    throw Error("A conexão do Gmail ainda precisa ser configurada na hospedagem.");
  const state = aleatorioGmail(),
    verificador = aleatorioGmail(),
    hash = await hashGmail(state);
  await rpcEmail("mimo_email_oauth_iniciar", {
    _empresa: empresa,
    _ator: ator,
    _hash: hash,
    _verificador: await cifrarGmail(verificador, cfg, `pkce:${hash}`),
  });
  const desafio = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador));
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [k, v] of Object.entries({
    client_id: cfg.clientId,
    redirect_uri: cfg.origem + CALLBACK_GMAIL,
    response_type: "code",
    scope: `openid email ${ESCOPO_GMAIL}`,
    access_type: "offline",
    prompt: "consent",
    login_hint: cfg.remetente,
    state,
    code_challenge: url64(btoa(String.fromCharCode(...new Uint8Array(desafio)))),
    code_challenge_method: "S256",
  }))
    u.searchParams.set(k, v);
  return { state, url: u.href };
}
export async function trocarCodigoGmail(
  code: string,
  verificador: string,
  cfg: ConfigGmail,
  fetcher = fetch,
) {
  const r = z
    .object({
      access_token: z.string().min(10),
      refresh_token: z.string().min(10).max(8000),
      token_type: z.string(),
      scope: z.string(),
    })
    .safeParse(
      await jsonGoogle(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uri: cfg.origem + CALLBACK_GMAIL,
            code,
            code_verifier: verificador,
            grant_type: "authorization_code",
          }),
        },
        fetcher,
      ),
    );
  if (!r.success) throw new FalhaGmail("resposta_google");
  if (
    r.data.token_type.toLowerCase() !== "bearer" ||
    !r.data.scope.split(/\s+/).includes(ESCOPO_GMAIL)
  )
    throw new FalhaGmail("permissao_envio");
  return {
    refresh: r.data.refresh_token,
    identidade: await identidadeGmail(r.data.access_token, cfg, fetcher),
  };
}
export async function callbackGmail(request: Request) {
  const cfg = configGmail();
  if (!cfg)
    return new Response("Conexão Gmail indisponível.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const redirect = (resultado: ResultadoGmail) => {
    const headers = new Headers({
      Location:
        cfg.origem +
        `/mimo/automacoes?gmail=${resultado === "sucesso" ? "sucesso" : "falha"}&gmail_motivo=${resultado}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    headers.append(
      "Set-Cookie",
      `${COOKIE_GMAIL}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    // Persiste o motivo seguro mesmo se um redirecionamento de login remover a busca.
    headers.append(
      "Set-Cookie",
      `${COOKIE_RESULTADO_GMAIL}=${resultado}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return new Response(null, {
      status: 303,
      headers,
    });
  };
  const u = new URL(request.url),
    state = u.searchParams.get("state"),
    code = u.searchParams.get("code");
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE_GMAIL + "="))
    ?.slice(COOKIE_GMAIL.length + 1);
  if (
    u.origin !== cfg.origem ||
    !state ||
    !/^[a-f0-9]{64}$/.test(state) ||
    cookie !== state ||
    !code ||
    code.length > 4096 ||
    u.searchParams.has("error")
  )
    return redirect(u.searchParams.has("error") ? "negada" : "navegador");
  let tentativa: { empresa: string; ator: string; hash: string } | null = null;
  let etapa: Exclude<ResultadoGmail, "sucesso"> = "estado_expirado";
  try {
    const hash = await hashGmail(state);
    const c = z
      .object({ empresa: z.string().uuid(), ator: z.string().uuid(), verificador: z.string() })
      .parse(await rpcEmail("mimo_email_oauth_consumir", { _hash: hash }));
    tentativa = { empresa: c.empresa, ator: c.ator, hash };
    etapa = "empresa";
    if (c.empresa !== cfg.empresa) throw Error("Empresa divergente.");
    const { configOAuthNuvem } = await import("./mimo-nuvemshop-oauth.server");
    const loja = configOAuthNuvem();
    etapa = "loja";
    if (!loja || loja.empresa !== c.empresa) throw Error("Loja indisponível.");
    etapa = "verificador";
    const verificador = await decifrarGmail(c.verificador, cfg, `pkce:${hash}`);
    etapa = "resposta_google";
    const tokens = await trocarCodigoGmail(code, verificador, cfg);
    etapa = "gravar_credencial";
    await rpcEmail("mimo_email_oauth_salvar", {
      _hash: hash,
      _empresa: c.empresa,
      _loja: loja.loja,
      _ator: c.ator,
      _remetente: tokens.identidade.email,
      _sub: tokens.identidade.sub,
      _cifrado: await cifrarGmail(tokens.refresh, cfg),
    });
    return redirect("sucesso");
  } catch (erro) {
    if (tentativa)
      try {
        await rpcEmail("mimo_email_oauth_falhar", {
          _hash: tentativa.hash,
          _empresa: tentativa.empresa,
          _ator: tentativa.ator,
        });
      } catch {
        return redirect("reserva_indisponivel");
      }
    return redirect(erro instanceof FalhaGmail ? erro.codigo : etapa);
  }
}
export async function acessoGmail(empresa: string, ator: string, fetcher = fetch) {
  const cfg = configGmail();
  if (!cfg || cfg.empresa !== empresa) throw Error("Configure a conexão do Gmail.");
  const c = z
    .object({
      remetente: emailGmailSchema,
      sub: z.string(),
      cifrado: z.string(),
      versao: z.string().uuid(),
    })
    .parse(await rpcEmail("mimo_email_credencial_ler", { _empresa: empresa, _ator: ator }));
  if (c.remetente !== cfg.remetente) throw Error("Reautorize o remetente configurado.");
  const token = z.object({ access_token: z.string().min(10), token_type: z.string() }).parse(
    await jsonGoogle(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          refresh_token: await decifrarGmail(c.cifrado, cfg),
          grant_type: "refresh_token",
        }),
      },
      fetcher,
    ),
  );
  if (token.token_type.toLowerCase() !== "bearer") throw Error("Autorização Gmail inválida.");
  const identidade = await identidadeGmail(token.access_token, cfg, fetcher);
  if (identidade.sub !== c.sub) throw Error("Identidade do Gmail divergente.");
  return { cfg, token: token.access_token, versao: c.versao };
}
export function mimeGmail(d: {
  remetente: string;
  destino: string;
  assunto: string;
  texto: string;
  html: string;
  id: string;
  descadastro?: string;
}) {
  const remetente = emailGmailSchema.parse(d.remetente),
    destino = emailGmailSchema.parse(d.destino),
    id = z.string().uuid().parse(d.id);
  const boundary = `mimo_${id.replaceAll("-", "")}`;
  const linhas = [
    `From: MiMo <${remetente}>`,
    `To: ${destino}`,
    `Reply-To: ${remetente}`,
    `Subject: ${assuntoMime(d.assunto)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <mimo-${id}@${remetente.split("@")[1]}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (d.descadastro) {
    const u = new URL(d.descadastro);
    if (u.protocol !== "https:" || /[\r\n<>]/.test(d.descadastro))
      throw Error("Descadastro inválido.");
    linhas.push(
      `List-Unsubscribe: <${u.href}>`,
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    );
  }
  for (const [tipo, body] of [
    ["text/plain", d.texto],
    ["text/html", d.html],
  ])
    linhas.push(
      "",
      `--${boundary}`,
      `Content-Type: ${tipo}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
      "",
      b64(body)
        .match(/.{1,76}/g)
        ?.join("\r\n") ?? "",
    );
  linhas.push("", `--${boundary}--`, "");
  return url64(b64(linhas.join("\r\n")));
}
export async function enviarGmail(token: string, raw: string, fetcher = fetch) {
  const r = await jsonGoogle(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
    fetcher,
  );
  return z.object({ id: z.string().min(1).max(300) }).parse(r).id;
}
export async function assinaturaDescadastro(
  cfg: ConfigGmail,
  fila: { id: string; empresa: string; email: string },
) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(cfg.chaveDescadastro),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(
          `mimo-email-descadastro-v1:${fila.empresa}:${fila.id}:${fila.email}`,
        ),
      ),
    ),
  );
}
export async function linkDescadastroGmail(
  cfg: ConfigGmail,
  fila: { id: string; empresa: string; email: string },
) {
  const u = new URL("/api/public/mimo-carrinhos-descadastro", cfg.origem);
  u.searchParams.set("id", fila.id);
  u.searchParams.set("assinatura", await assinaturaDescadastro(cfg, fila));
  return u.href;
}
export async function tratarDescadastroGmail(request: Request) {
  const cfg = configDescadastroGmail(),
    u = new URL(request.url),
    id = u.searchParams.get("id"),
    sig = u.searchParams.get("assinatura");
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
  };
  const resposta = (s: string, status = 200) =>
    new Response(
      `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>E-mails MiMo</title><body><h1>MiMo</h1>${s}</body></html>`,
      { status, headers },
    );
  if (
    !cfg ||
    u.origin !== cfg.origem ||
    !z.string().uuid().safeParse(id).success ||
    !sig ||
    !/^[a-f0-9]{64}$/.test(sig)
  )
    return resposta("<p>Link de descadastro inválido.</p>", 400);
  try {
    const c = z
      .object({ empresa: z.string().uuid(), email: emailGmailSchema })
      .parse(await rpcEmail("mimo_email_descadastro_contexto", { _id: id! }));
    if (c.empresa !== cfg.empresa) throw Error("Inválido.");
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(cfg.chaveDescadastro),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valido = await crypto.subtle.verify(
      "HMAC",
      key,
      bytes(sig),
      new TextEncoder().encode(`mimo-email-descadastro-v1:${c.empresa}:${id}:${c.email}`),
    );
    if (!valido) return resposta("<p>Link de descadastro inválido.</p>", 400);
    if (request.method === "POST") {
      await rpcEmail("mimo_email_descadastrar", { _id: id! });
      return resposta(
        "<p>Pronto. Você não receberá novos lembretes de carrinho por e-mail da MiMo.</p>",
      );
    }
    if (request.method !== "GET") return resposta("<p>Método indisponível.</p>", 405);
    return resposta(
      '<p>Deseja parar de receber lembretes de carrinho por e-mail?</p><form method="post"><button type="submit">Parar os lembretes por e-mail</button></form>',
    );
  } catch {
    return resposta(
      "<p>Não foi possível verificar este link. Tente novamente mais tarde.</p>",
      503,
    );
  }
}
