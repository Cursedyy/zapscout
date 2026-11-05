import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { configNuvem, type ConfigNuvem } from "./mimo-nuvemshop.server";
export const COOKIE_NUVEM = "__Host-mimo_nuvem_oauth";
export const CALLBACK_NUVEM = "/api/public/nuvemshop-oauth";
export function configOAuthNuvem(env = process.env) {
  const base = configNuvem({ ...env, MIMO_NUVEMSHOP_ACCESS_TOKEN: "oauth-pendente" });
  const r = z
    .object({
      MIMO_NUVEMSHOP_APP_ID: z.string().regex(/^[1-9]\d*$/),
      MIMO_NUVEMSHOP_APP_SECRET: z.string().min(16),
      MIMO_NUVEMSHOP_TOKEN_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
      MIMO_NUVEMSHOP_ORIGIN: z.string().url(),
    })
    .safeParse(env);
  if (!base || !r.success) return null;
  const u = new URL(r.data.MIMO_NUVEMSHOP_ORIGIN);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.port
  )
    return null;
  return {
    ...base,
    appId: r.data.MIMO_NUVEMSHOP_APP_ID,
    secret: r.data.MIMO_NUVEMSHOP_APP_SECRET,
    key: r.data.MIMO_NUVEMSHOP_TOKEN_KEY,
    origin: u.origin,
  };
}
type OAuthConfig = NonNullable<ReturnType<typeof configOAuthNuvem>>;
class FalhaOAuth extends Error {
  constructor(readonly motivo: string) {
    super("Não foi possível concluir a autorização.");
  }
}
const hex = (b: Uint8Array) => [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
function bytes(s: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(s)) throw Error("Formato inválido.");
  return Uint8Array.from(s.match(/../g)!, (s) => parseInt(s, 16));
}
export async function hashEstadoNuvem(s: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
export function novoEstadoNuvem() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}
export function urlAutorizarNuvem(cfg: OAuthConfig, state: string) {
  const u = new URL(`https://www.nuvemshop.com.br/apps/${cfg.appId}/authorize`);
  u.searchParams.set("state", state);
  return u.href;
}
function aad(cfg: OAuthConfig) {
  return new TextEncoder().encode(`mimo-nuvem-v1:${cfg.empresa}:${cfg.loja}`);
}
export async function cifrarTokenNuvem(token: string, cfg: OAuthConfig) {
  const key = await crypto.subtle.importKey("raw", bytes(cfg.key), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(cfg) },
    key,
    new TextEncoder().encode(token),
  );
  return `v1:${hex(iv)}:${hex(new Uint8Array(ciphertext))}`;
}
export async function decifrarTokenNuvem(valor: string, cfg: OAuthConfig) {
  const [v, iv, cipher, ...extra] = valor.split(":");
  if (v !== "v1" || iv?.length !== 24 || !cipher || extra.length)
    throw Error("Credencial indisponível.");
  const key = await crypto.subtle.importKey("raw", bytes(cfg.key), "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv), additionalData: aad(cfg) },
      key,
      bytes(cipher),
    ),
  );
}
export async function trocarCodigoNuvem(code: string, cfg: OAuthConfig, fetcher = fetch) {
  let r: Response;
  try {
    r = await fetcher("https://www.nuvemshop.com.br/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.appId,
        client_secret: cfg.secret,
        grant_type: "authorization_code",
        code,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new FalhaOAuth("provedor_indisponivel");
  }
  if (!r.ok)
    throw new FalhaOAuth(
      r.status === 400 || r.status === 401 ? "codigo_recusado" : "provedor_indisponivel",
    );
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    throw new FalhaOAuth("resposta_invalida");
  }
  const p = z
    .object({
      access_token: z.string().min(10).max(4096),
      user_id: z.union([z.string(), z.number().int().safe()]).transform(String),
      scope: z.string(),
      token_type: z.string(),
    })
    .safeParse(body);
  if (!p.success || p.data.token_type.toLowerCase() !== "bearer")
    throw new FalhaOAuth("resposta_invalida");
  if (p.data.user_id !== cfg.loja) throw new FalhaOAuth("loja_divergente");
  if (!p.data.scope.split(/[,\s]+/).some((s) => s === "read_orders" || s === "write_orders"))
    throw new FalhaOAuth("permissao_pedidos");
  return p.data.access_token;
}
type ContextoOAuth = { empresa_id: string; loja_id: string; ator_id: string };
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      mimo_nuvem_oauth_iniciar: {
        Args: { _empresa: string; _loja: string; _ator: string; _hash: string };
        Returns: undefined;
      };
      mimo_nuvem_oauth_consumir: { Args: { _hash: string }; Returns: ContextoOAuth[] };
      mimo_nuvem_oauth_salvar: {
        Args: { _hash: string; _empresa: string; _loja: string; _ator: string; _cifrado: string };
        Returns: undefined;
      };
      mimo_nuvem_oauth_ler: {
        Args: { _empresa: string; _loja: string; _ator: string };
        Returns: string | null;
      };
    };
  };
};
async function dbOAuth() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient<DB>;
}
export async function iniciarOAuthNuvem(empresa: string, ator: string) {
  const cfg = configOAuthNuvem();
  if (!cfg || cfg.empresa !== empresa)
    throw Error("O aplicativo Nuvemshop ainda precisa ser configurado.");
  const state = novoEstadoNuvem();
  const db = await dbOAuth();
  const r = await db.rpc("mimo_nuvem_oauth_iniciar", {
    _empresa: empresa,
    _loja: cfg.loja,
    _ator: ator,
    _hash: await hashEstadoNuvem(state),
  });
  if (r.error?.message?.includes("Uma autorização ainda está sendo processada"))
    throw Error(
      "A tentativa anterior ainda está reservada por até dez minutos. Aguarde esse prazo e inicie novamente nesta tela.",
    );
  if (r.error?.message?.includes("Aguarde antes de tentar novamente"))
    throw Error("Limite de tentativas atingido. Aguarde dez minutos antes de conectar novamente.");
  if (r.error)
    throw Error(
      "Não foi possível iniciar a conexão. Confira a preparação da integração e seu acesso.",
    );
  return { url: urlAutorizarNuvem(cfg, state), state };
}
export async function obterConfigNuvem(empresa: string, ator: string): Promise<ConfigNuvem | null> {
  const legado = configNuvem();
  const cfg = configOAuthNuvem();
  if (!cfg || cfg.empresa !== empresa) return legado?.empresa === empresa ? legado : null;
  const db = await dbOAuth();
  const r = await db.rpc("mimo_nuvem_oauth_ler", {
    _empresa: empresa,
    _loja: cfg.loja,
    _ator: ator,
  });
  if (r.error) return null;
  if (!r.data) return legado?.empresa === empresa ? legado : null;
  try {
    return {
      empresa: cfg.empresa,
      loja: cfg.loja,
      agente: cfg.agente,
      hosts: cfg.hosts,
      token: await decifrarTokenNuvem(r.data, cfg),
    };
  } catch {
    return null;
  }
}
export async function callbackOAuthNuvem(request: Request) {
  const cfg = configOAuthNuvem();
  if (!cfg)
    return new Response("A conexão ainda não está disponível.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const redirect = (status: string, motivo?: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location:
          cfg.origin + "/mimo/automacoes?conexao=" + status + (motivo ? "&motivo=" + motivo : ""),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": `${COOKIE_NUVEM}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    });
  const u = new URL(request.url),
    state = u.searchParams.get("state"),
    code = u.searchParams.get("code");
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE_NUVEM + "="))
    ?.slice(COOKIE_NUVEM.length + 1);
  if (
    u.origin !== cfg.origin ||
    !state ||
    !/^[a-f0-9]{64}$/.test(state) ||
    cookie !== state ||
    !code ||
    code.length > 1000 ||
    u.searchParams.has("error")
  )
    return redirect("falha", "navegador");
  try {
    const db = await dbOAuth(),
      hash = await hashEstadoNuvem(state);
    const r = await db.rpc("mimo_nuvem_oauth_consumir", { _hash: hash });
    const c = r.data?.[0];
    if (r.error || !c || c.empresa_id !== cfg.empresa || c.loja_id !== cfg.loja)
      return redirect("falha", "estado_expirado");
    const token = await trocarCodigoNuvem(code, cfg);
    const salvo = await db.rpc("mimo_nuvem_oauth_salvar", {
      _hash: hash,
      _empresa: c.empresa_id,
      _loja: c.loja_id,
      _ator: c.ator_id,
      _cifrado: await cifrarTokenNuvem(token, cfg),
    });
    return salvo.error ? redirect("falha", "gravar_credencial") : redirect("sucesso");
  } catch (error) {
    return redirect("falha", error instanceof FalhaOAuth ? error.motivo : "falha_interna");
  }
}
