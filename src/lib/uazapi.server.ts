/**
 * UAZAPI HTTP client (server-only).
 * Docs: https://docs.uazapi.com/
 *
 * Endpoints usados:
 *  - POST {base}/instance/init  (admintoken)  → cria instância, retorna { token }
 *  - POST {base}/instance/connect (token)     → retorna QR code base64
 *  - GET  {base}/instance/status  (token)     → { instance: { status: connected|connecting|... , profileName, profileNumber } }
 *  - POST {base}/send/text       (token)      → { number, text }
 *  - POST {base}/send/media      (token)      → { number, type, file (URL ou base64), text? }
 *  - POST {base}/webhook (token) → { url, events, enabled }
 *  - POST {base}/instance/disconnect (token)
 */

export class UazApiError extends Error {
  constructor(
    readonly tipo: "http" | "rede" | "tempo" | "configuracao" | "resposta",
    readonly operacao: string,
    readonly status?: number,
    desconectado = false,
  ) {
    super(
      `UAZAPI ${operacao}${status ? ` [${status}]` : ""}: ${desconectado ? "WhatsApp disconnected" : tipo}`,
    );
  }
}
const baseUrl = () => {
  const u = process.env.UAZAPI_BASE_URL;
  if (!u?.trim()) throw new UazApiError("configuracao", "servidor");
  return u.trim().replace(/\/+$/, "");
};

const adminToken = () => {
  const t = process.env.UAZAPI_ADMIN_TOKEN;
  if (!t) throw new UazApiError("configuracao", "credencial administrativa");
  return t;
};

async function call<T = unknown>(
  path: string,
  opts: {
    method?: "GET" | "POST";
    token?: string;
    useAdmin?: boolean;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.useAdmin) headers["admintoken"] = adminToken();
  if (opts.token) headers["token"] = opts.token;

  const url = `${baseUrl()}${path}`;
  const signal = opts.signal ?? AbortSignal.timeout(15000);
  let res: Response, text: string;
  try {
    res = await fetch(url, {
      method: opts.method ?? "POST",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal,
      redirect: "error",
    });
    text = await res.text();
  } catch {
    throw new UazApiError(signal.aborted ? "tempo" : "rede", path);
  }
  if (!res.ok) {
    const desconectado =
      /whatsapp\s+disconnected|session\s+is\s+not\s+reconnectable|not\s+connected|instance\s+disconnected|connection\s+closed/i.test(
        text,
      );
    throw new UazApiError("http", path, res.status, desconectado);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function uazInitInstance(name: string): Promise<{ token: string }> {
  type Init = { token?: string; instance?: { token?: string } };
  let data: Init;
  try {
    data = await call<Init>("/instance/init", { useAdmin: true, body: { name } });
  } catch (error) {
    if (!(error instanceof UazApiError) || ![404, 405].includes(error.status ?? 0)) throw error;
    data = await call<Init>("/instance/create", { useAdmin: true, body: { name } });
  }
  const token = data.token ?? data.instance?.token;
  if (typeof token !== "string" || !token) throw new UazApiError("resposta", "criar instância");
  return { token };
}

export type UazStatus = {
  status: "disconnected" | "connecting" | "connected" | string;
  qrcode?: string; // base64 (data:image/png;base64,...)
  profileNumber?: string;
  profileName?: string;
};

export async function uazConnect(token: string): Promise<UazStatus> {
  const data = await call<{ qrcode?: string; instance?: { status?: string; qrcode?: string } }>(
    "/instance/connect",
    { token, body: {} },
  );
  if (!data || typeof data !== "object") throw new UazApiError("resposta", "pareamento");
  return {
    status: data.instance?.status ?? "connecting",
    qrcode: data.qrcode ?? data.instance?.qrcode,
  };
}

export async function uazStatus(token: string, signal?: AbortSignal): Promise<UazStatus> {
  const data = await call<{
    instance?: { status?: string; profileNumber?: string; profileName?: string; qrcode?: string };
    status?: { connected?: boolean; jid?: { user?: string } | null };
  }>("/instance/status", { method: "GET", token, signal });
  if (!data || typeof data !== "object") throw new UazApiError("resposta", "status");
  const i = data.instance ?? {};
  return {
    status:
      (i.status as UazStatus["status"]) ?? (data.status?.connected ? "connected" : "disconnected"),
    qrcode: i.qrcode,
    profileNumber: data.status?.jid?.user ?? i.profileNumber,
    profileName: i.profileName,
  };
}

export async function uazDisconnect(token: string): Promise<void> {
  await call("/instance/disconnect", { token });
}

/**
 * Garante prefixo 55 (código Brasil) para números locais de 10/11 dígitos.
 * UAZAPI pode rejeitar ou entregar errado quando o número vai sem DDI.
 */
export function normalizeBrWhatsappNumber(raw: string): string {
  const d = raw.replace(/\D+/g, "");
  if (!d) return d;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

export async function uazSendText(
  token: string,
  number: string,
  text: string,
  opts: { delay?: number } = {},
): Promise<{ id?: string }> {
  const clean = normalizeBrWhatsappNumber(number);
  // `delay` (ms): a UAZAPI mostra "digitando..." ao contato durante a espera.
  const body: Record<string, unknown> = { number: clean, text };
  if (opts.delay && opts.delay > 0) body.delay = Math.round(opts.delay);
  const data = await call<{ messageid?: string; id?: string; key?: { id?: string } }>(
    "/send/text",
    { token, body },
  );
  return { id: data.messageid ?? data.id ?? data.key?.id };
}

/**
 * Envia mídia (imagem/vídeo/documento/áudio/sticker) via UAZAPI.
 * `file` aceita URL pública OU base64 (mesmo campo — a API detecta o
 * formato). Confirmado no spec real da UAZAPI (POST /send/media,
 * operationId sendMedia): campos obrigatórios são number/type/file.
 */
export async function uazSendMedia(
  token: string,
  number: string,
  fileUrl: string,
  opts: { type?: "image" | "video" | "document" | "audio" | "sticker"; caption?: string } = {},
): Promise<{ id?: string }> {
  const clean = normalizeBrWhatsappNumber(number);
  const data = await call<{ messageid?: string; id?: string; key?: { id?: string } }>(
    "/send/media",
    {
      token,
      body: {
        number: clean,
        type: opts.type ?? "image",
        file: fileUrl,
        ...(opts.caption ? { text: opts.caption } : {}),
      },
    },
  );
  return { id: data.messageid ?? data.id ?? data.key?.id };
}

export async function uazUpdateWebhook(
  token: string,
  url: string,
  events: string[] = ["messages"],
): Promise<void> {
  await call("/webhook", {
    token,
    body: { url, events, enabled: true, excludeMessages: ["wasSentByApi"] },
  });
}
