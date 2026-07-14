/**
 * Dispatch shared entre o envio manual direto (`sendNow`) e o cron
 * `process-envios-manuais`. Ambos precisam falar com múltiplos provedores
 * de WhatsApp (uazapi gerenciado, uazapi próprio via API Key, Evolution, Meta).
 */
import { uazSendText } from "@/lib/uazapi.server";

export type ProviderProfile = {
  wa_provider: string | null;
  wa_method: string | null;
  wa_server_url: string | null;
  wa_api_key: string | null;
  wa_instance_name: string | null;
  wa_meta_phone_id: string | null;
  wa_meta_token: string | null;
  uazapi_instance_token: string | null;
  uazapi_instance_status: string | null;
};

export function isWhatsAppDisconnectedError(message: string): boolean {
  return /whatsapp\s+disconnected|session\s+is\s+not\s+reconnectable|not\s+connected|instance\s+disconnected|connection\s+closed|disconnected/i.test(
    message,
  );
}

function providerBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function dispatchWhatsAppServer(
  profile: ProviderProfile,
  numero: string,
  texto: string,
): Promise<{ messageId: string | null }> {
  if (
    profile.wa_method === "qrcode" &&
    profile.wa_provider === "uazapi" &&
    profile.uazapi_instance_token &&
    profile.uazapi_instance_status === "connected"
  ) {
    const r = await uazSendText(profile.uazapi_instance_token, numero, texto);
    return { messageId: r.id ?? null };
  }

  if (
    profile.wa_method === "apikey" &&
    profile.wa_provider === "uazapi" &&
    profile.wa_server_url &&
    profile.wa_api_key
  ) {
    const url = `${providerBaseUrl(profile.wa_server_url)}/send/text`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: profile.wa_api_key },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      if (isWhatsAppDisconnectedError(body)) throw new Error("WA_NAO_CONECTADO");
      throw new Error(`UAZAPI [${r.status}]: ${body}`);
    }
    const j = (await r.json().catch(() => ({}))) as { messageid?: string; id?: string };
    return { messageId: j.messageid ?? j.id ?? null };
  }

  if (
    profile.wa_method === "apikey" &&
    profile.wa_provider === "evolution" &&
    profile.wa_server_url &&
    profile.wa_api_key &&
    profile.wa_instance_name
  ) {
    const url = `${providerBaseUrl(profile.wa_server_url)}/message/sendText/${encodeURIComponent(
      profile.wa_instance_name,
    )}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: profile.wa_api_key },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      if (isWhatsAppDisconnectedError(body)) throw new Error("WA_NAO_CONECTADO");
      throw new Error(`Evolution [${r.status}]: ${body}`);
    }
    const j = (await r.json().catch(() => ({}))) as { key?: { id?: string } };
    return { messageId: j.key?.id ?? null };
  }

  if (
    profile.wa_method === "apikey" &&
    profile.wa_provider === "meta" &&
    profile.wa_meta_phone_id &&
    profile.wa_meta_token
  ) {
    const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(
      profile.wa_meta_phone_id,
    )}/messages`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${profile.wa_meta_token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: numero,
        type: "text",
        text: { body: texto },
      }),
    });
    if (!r.ok) throw new Error(`Meta [${r.status}]: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
    return { messageId: j.messages?.[0]?.id ?? null };
  }

  throw new Error("WA_NAO_CONECTADO");
}
