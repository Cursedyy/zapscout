/**
 * UAZAPI HTTP client (server-only).
 * Docs: https://docs.uazapi.com/
 *
 * Endpoints usados:
 *  - POST {base}/instance/init  (admintoken)  → cria instância, retorna { token }
 *  - POST {base}/instance/connect (token)     → retorna QR code base64
 *  - GET  {base}/instance/status  (token)     → { instance: { status: connected|connecting|... , profileName, profileNumber } }
 *  - POST {base}/send/text       (token)      → { number, text }
 *  - POST {base}/instance/updateWebhook(token)→ { url, events, enabled }
 *  - POST {base}/instance/disconnect (token)
 */

const baseUrl = () => {
  const u = process.env.UAZAPI_BASE_URL;
  if (!u) throw new Error("UAZAPI_BASE_URL não configurada");
  return u.replace(/\/+$/, "");
};

const adminToken = () => {
  const t = process.env.UAZAPI_ADMIN_TOKEN;
  if (!t) throw new Error("UAZAPI_ADMIN_TOKEN não configurado");
  return t;
};

async function call<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST"; token?: string; useAdmin?: boolean; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.useAdmin) headers["admintoken"] = adminToken();
  if (opts.token) headers["token"] = opts.token;

  const res = await fetch(`${baseUrl()}${path}`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`UAZAPI ${path} [${res.status}]: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function uazInitInstance(name: string): Promise<{ token: string }> {
  const data = await call<{ token?: string; instance?: { token?: string } }>(
    "/instance/init",
    { useAdmin: true, body: { name } },
  );
  const token = data.token ?? data.instance?.token;
  if (!token) throw new Error("UAZAPI não retornou token da instância");
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
    { token },
  );
  return {
    status: data.instance?.status ?? "connecting",
    qrcode: data.qrcode ?? data.instance?.qrcode,
  };
}

export async function uazStatus(token: string): Promise<UazStatus> {
  const data = await call<{
    instance?: { status?: string; profileNumber?: string; profileName?: string; qrcode?: string };
  }>("/instance/status", { method: "GET", token });
  const i = data.instance ?? {};
  return {
    status: (i.status as UazStatus["status"]) ?? "disconnected",
    qrcode: i.qrcode,
    profileNumber: i.profileNumber,
    profileName: i.profileName,
  };
}

export async function uazDisconnect(token: string): Promise<void> {
  await call("/instance/disconnect", { token });
}

export async function uazSendText(token: string, number: string, text: string): Promise<{ id?: string }> {
  // UAZAPI aceita número puro (55DDD9XXXXYYYY) ou com @s.whatsapp.net
  const clean = number.replace(/\D+/g, "");
  const data = await call<{ messageid?: string; id?: string; key?: { id?: string } }>(
    "/send/text",
    { token, body: { number: clean, text } },
  );
  return { id: data.messageid ?? data.id ?? data.key?.id };
}

export async function uazUpdateWebhook(
  token: string,
  url: string,
  events: string[] = ["messages"],
): Promise<void> {
  await call("/instance/updateWebhook", {
    token,
    body: { url, events, enabled: true, excludeMessages: ["wasSentByApi"] },
  });
}
