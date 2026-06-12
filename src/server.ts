import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

const BASE_SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// Em DEV o Vite injeta HMR/React Refresh com inline scripts e eval, então
// relaxamos só nesse ambiente. Em produção CSP é estrita com nonce.
const IS_DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildCsp(nonce: string | null): string {
  if (IS_DEV) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    // style-src-attr exige 'unsafe-inline' p/ atributos style=""; mantemos
    // 'unsafe-inline' só em estilos (risco baixo vs scripts).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function applyBaseHeaders(headers: Headers): void {
  for (const [k, v] of Object.entries(BASE_SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
}

// HTMLRewriter está disponível no runtime workerd (Cloudflare Workers).
declare const HTMLRewriter: {
  new (): {
    on(selector: string, handlers: { element(el: { setAttribute(name: string, value: string): void; getAttribute(name: string): string | null }): void }): unknown;
    transform(response: Response): Response;
  };
};

function withSecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");

  // Para respostas não-HTML aplicamos CSP sem nonce (não há inline scripts).
  if (!isHtml) {
    const headers = new Headers(response.headers);
    applyBaseHeaders(headers);
    if (!headers.has("Content-Security-Policy")) {
      headers.set("Content-Security-Policy", buildCsp(null));
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const nonce = generateNonce();

  // Injeta nonce em todo <script> inline/externo emitido pelo SSR (incluindo
  // os scripts de hidratação do TanStack Start). HTMLRewriter faz streaming.
  let rewritten: Response = response;
  if (typeof HTMLRewriter !== "undefined") {
    rewritten = new HTMLRewriter()
      .on("script", {
        element(el) {
          if (!el.getAttribute("nonce")) el.setAttribute("nonce", nonce);
        },
      })
      .on("style", {
        element(el) {
          if (!el.getAttribute("nonce")) el.setAttribute("nonce", nonce);
        },
      })
      .transform(response);
  }

  const headers = new Headers(rewritten.headers);
  applyBaseHeaders(headers);
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", buildCsp(nonce));
  }
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return withSecurityHeaders(normalized);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(brandedErrorResponse());
    }
  },
};
