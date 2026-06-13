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

// CSP relaxada só pra dev (Vite/HMR). Pré-computada — não há custo por request.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' ws: wss: https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// CSP de bloqueio para respostas não-documento (JSON de API, downloads, binários).
// Browsers não aplicam CSP em respostas non-document, mas mandar uma política
// lockdown é defesa em profundidade: se algo for renderizado por engano
// (ex: sniffing de content-type), nada carrega. Pré-computada.
const NON_DOCUMENT_CSP = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "sandbox",
].join("; ");

function buildHtmlCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src-attr exige 'unsafe-inline' p/ atributos style=""; mantemos
    // 'unsafe-inline' só em estilos (risco baixo vs scripts).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // wss: necessário para Supabase Realtime (WebSocket). Sem isso o canal
    // fica em loop de reconexão e lança "cannot add postgres_changes callbacks
    // after subscribe()" derrubando a rota via TanStack Router error boundary.
    "connect-src 'self' https: wss:",
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
type RewriterElement = {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
};
type Rewriter = {
  on(selector: string, handlers: { element(el: RewriterElement): void }): Rewriter;
  transform(response: Response): Response;
};
declare const HTMLRewriter: { new (): Rewriter };

function isHtmlContentType(contentType: string): boolean {
  // Cobre "text/html", "text/html; charset=utf-8", "application/xhtml+xml".
  const ct = contentType.toLowerCase();
  return ct.includes("text/html") || ct.includes("application/xhtml+xml");
}

// Status codes que por especificação NÃO têm body — nada a sniffar.
const BODYLESS_STATUS = new Set([101, 204, 205, 304]);

const SNIFF_BYTES = 512;
const HTML_SIGNATURES = ["<!doctype html", "<html", "<head", "<body", "<!--"];

// Lê só o 1º chunk (≤512B) via tee — não bufferiza o body inteiro, mantém o
// streaming do resto. Custo: 1 read assíncrona. Usado APENAS quando o
// content-type está ausente; respostas com CT explícito são confiadas.
async function sniffResponse(
  response: Response,
): Promise<{ isHtml: boolean; response: Response }> {
  if (!response.body || BODYLESS_STATUS.has(response.status)) {
    return { isHtml: false, response };
  }
  const [forSniff, forForward] = response.body.tee();
  const reader = forSniff.getReader();
  let head = "";
  try {
    const { value } = await reader.read();
    if (value && value.byteLength > 0) {
      const slice = value.subarray(0, Math.min(value.byteLength, SNIFF_BYTES));
      head = new TextDecoder("utf-8", { fatal: false }).decode(slice).trimStart().toLowerCase();
    }
  } catch {
    // erro de leitura: trata como não-HTML (lockdown seguro).
  } finally {
    reader.cancel().catch(() => {});
  }
  const isHtml = HTML_SIGNATURES.some((sig) => head.startsWith(sig));
  // Reconstrói com content-type explícito pra impedir mime-sniffing do browser
  // (combinado com X-Content-Type-Options: nosniff aplicado depois).
  const headers = new Headers(response.headers);
  headers.set("content-type", isHtml ? "text/html; charset=utf-8" : "application/octet-stream");
  return {
    isHtml,
    response: new Response(forForward, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  };
}

async function withSecurityHeaders(response: Response): Promise<Response> {
  // Decide tipo de resposta:
  //  - CT presente e HTML/XHTML → caminho HTML (nonce + rewriter).
  //  - CT presente e outro       → caminho não-documento (lockdown, sem sniff).
  //  - CT ausente/vazio          → sniff 1 chunk; aplica o ramo correto e
  //                                seta CT explícito pra evitar mime-sniff.
  let workingResponse = response;
  let isHtml = false;
  const rawCt = response.headers.get("content-type");
  if (rawCt && rawCt.trim().length > 0) {
    isHtml = isHtmlContentType(rawCt);
  } else {
    const sniffed = await sniffResponse(response);
    isHtml = sniffed.isHtml;
    workingResponse = sniffed.response;
  }

  // Rota não-HTML (JSON, downloads, binários, redirects sem body, ou sniff
  // negativo): não gera nonce, não toca no body, aplica CSP lockdown estática.
  if (!isHtml) {
    const headers = new Headers(workingResponse.headers);
    applyBaseHeaders(headers);
    if (!headers.has("Content-Security-Policy")) {
      headers.set("Content-Security-Policy", IS_DEV ? DEV_CSP : NON_DOCUMENT_CSP);
    }
    return new Response(workingResponse.body, {
      status: workingResponse.status,
      statusText: workingResponse.statusText,
      headers,
    });
  }

  // Em dev, pula nonce/HTMLRewriter (HMR depende de inline + eval).
  if (IS_DEV) {
    const headers = new Headers(workingResponse.headers);
    applyBaseHeaders(headers);
    if (!headers.has("Content-Security-Policy")) {
      headers.set("Content-Security-Policy", DEV_CSP);
    }
    return new Response(workingResponse.body, {
      status: workingResponse.status,
      statusText: workingResponse.statusText,
      headers,
    });
  }

  const nonce = generateNonce();

  // Injeta nonce em todo <script>/<style> inline emitido pelo SSR (incluindo
  // os scripts de hidratação do TanStack Start). HTMLRewriter faz streaming —
  // não bufferiza o body, então não há regressão de TTFB.
  let rewritten: Response = workingResponse;
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
      .transform(workingResponse);
  }

  const headers = new Headers(rewritten.headers);
  applyBaseHeaders(headers);
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", buildHtmlCsp(nonce));
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
      return await withSecurityHeaders(normalized);
    } catch (error) {
      console.error(error);
      return await withSecurityHeaders(brandedErrorResponse());
    }
  },
};
