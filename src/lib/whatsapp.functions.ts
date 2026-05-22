import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  uazInitInstance,
  uazConnect,
  uazStatus,
  uazDisconnect,
  uazSendText,
  uazUpdateWebhook,
} from "./uazapi.server";

/** URL pública do webhook (usada quando a instância é criada). */
function publicWebhookUrl(): string {
  const base =
    process.env.PUBLIC_APP_URL ||
    `https://project--${process.env.VITE_SUPABASE_PROJECT_ID ?? "20f307c2-3309-44e4-9aec-4535cdcee2be"}.lovable.app`;
  const secret = process.env.UAZAPI_WEBHOOK_SECRET ?? "";
  return `${base}/api/public/uazapi-webhook?secret=${encodeURIComponent(secret)}`;
}

// ============================================================================
// PROVEDOR GERENCIADO (UAZAPI via QR Code do nosso servidor)
// ============================================================================

/** Conecta (ou recria) a instância UAZAPI gerenciada e retorna QR code. */
export const connectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("uazapi_instance_token")
      .eq("id", userId)
      .single();

    let token = profile?.uazapi_instance_token ?? null;

    if (!token) {
      const created = await uazInitInstance(`zapscout_${userId.slice(0, 8)}`);
      token = created.token;
      await supabaseAdmin
        .from("profiles")
        .update({
          uazapi_instance_token: token,
          uazapi_instance_status: "connecting",
          wa_provider: "uazapi",
          wa_method: "qrcode",
        })
        .eq("id", userId);
    }

    try {
      await uazUpdateWebhook(token, publicWebhookUrl(), ["messages"]);
    } catch (e) {
      console.warn("Falha ao configurar webhook UAZAPI:", e);
    }

    try {
      const conn = await uazConnect(token);
      return { token, status: conn.status, qrcode: conn.qrcode ?? null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Servidor UAZAPI compartilhado lotado (429 / "Maximum number of instances")
      if (
        msg.includes("429") ||
        /maximum number of instances/i.test(msg) ||
        /instances connected reached/i.test(msg)
      ) {
        throw new Error(
          "Nosso servidor de WhatsApp compartilhado está temporariamente lotado. Por favor, tente novamente em alguns minutos ou conecte usando sua própria API Key (aba \"Usar minha API Key\").",
        );
      }
      throw new Error(`Não foi possível gerar o QR Code: ${msg}`);
    }
  });

/** Status atual da instância gerenciada. */
export const statusWhatsApp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("uazapi_instance_token, uazapi_numero, uazapi_instance_status")
      .eq("id", userId)
      .single();

    if (!profile?.uazapi_instance_token) {
      return { status: "desconectado" as const, qrcode: null, numero: null };
    }

    try {
      const s = await uazStatus(profile.uazapi_instance_token);
      await supabaseAdmin
        .from("profiles")
        .update({
          uazapi_instance_status: s.status,
          uazapi_numero: s.profileNumber ?? profile.uazapi_numero ?? null,
          uazapi_ultimo_ping: new Date().toISOString(),
          wa_display_name: s.profileName ?? null,
        })
        .eq("id", userId);
      return {
        status: s.status,
        qrcode: s.qrcode ?? null,
        numero: s.profileNumber ?? profile.uazapi_numero ?? null,
        profileName: s.profileName ?? null,
      };
    } catch (e) {
      console.error("uazStatus erro:", e);
      return {
        status: profile.uazapi_instance_status ?? "desconectado",
        qrcode: null,
        numero: profile.uazapi_numero ?? null,
      };
    }
  });

/** Desconecta totalmente (qualquer provedor). */
export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("uazapi_instance_token")
      .eq("id", userId)
      .single();
    if (profile?.uazapi_instance_token) {
      try {
        await uazDisconnect(profile.uazapi_instance_token);
      } catch (e) {
        console.warn("disconnect:", e);
      }
    }
    await supabaseAdmin
      .from("profiles")
      .update({
        uazapi_instance_status: "desconectado",
        wa_provider: null,
        wa_method: null,
        wa_server_url: null,
        wa_api_key: null,
        wa_instance_name: null,
        wa_meta_phone_id: null,
        wa_meta_token: null,
        wa_meta_business_id: null,
        wa_display_name: null,
        uazapi_numero: null,
      })
      .eq("id", userId);
    return { ok: true };
  });

// ============================================================================
// CONFIG MULTI-PROVEDOR (UazAPI/Evolution/Meta via API Key própria)
// ============================================================================

const saveCredsSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("uazapi"),
    serverUrl: z.string().url(),
    apiKey: z.string().min(8),
    instanceName: z.string().min(1).max(120),
  }),
  z.object({
    provider: z.literal("evolution"),
    serverUrl: z.string().url(),
    apiKey: z.string().min(8),
    instanceName: z.string().min(1).max(120),
  }),
  z.object({
    provider: z.literal("meta"),
    phoneNumberId: z.string().min(5).max(40),
    accessToken: z.string().min(20),
    businessAccountId: z.string().min(5).max(40),
  }),
]);

/** Verifica credenciais contra o provedor escolhido SEM salvar. */
export const verifyWhatsAppCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveCredsSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      if (data.provider === "uazapi") {
        const url = `${data.serverUrl.replace(/\/+$/, "")}/instance/status`;
        const res = await fetch(url, { headers: { token: data.apiKey } });
        if (!res.ok) throw new Error(`UAZAPI [${res.status}]`);
        const j = (await res.json()) as { instance?: { status?: string; profileNumber?: string; profileName?: string } };
        return {
          ok: true,
          numero: j.instance?.profileNumber ?? null,
          displayName: j.instance?.profileName ?? null,
          status: j.instance?.status ?? "unknown",
        };
      }
      if (data.provider === "evolution") {
        const url = `${data.serverUrl.replace(/\/+$/, "")}/instance/connectionState/${encodeURIComponent(data.instanceName)}`;
        const res = await fetch(url, { headers: { apikey: data.apiKey } });
        if (!res.ok) throw new Error(`Evolution [${res.status}]`);
        const j = (await res.json()) as { instance?: { state?: string }; state?: string };
        return {
          ok: true,
          numero: null,
          displayName: null,
          status: j.instance?.state ?? j.state ?? "unknown",
        };
      }
      // Meta
      const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(data.phoneNumberId)}?fields=display_phone_number,verified_name`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${data.accessToken}` } });
      if (!res.ok) throw new Error(`Meta [${res.status}]`);
      const j = (await res.json()) as { display_phone_number?: string; verified_name?: string };
      return {
        ok: true,
        numero: j.display_phone_number ?? null,
        displayName: j.verified_name ?? null,
        status: "connected",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg, numero: null, displayName: null, status: "error" as const };
    }
  });

/** Salva credenciais (após verificação) no profile. */
export const saveWhatsAppCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveCredsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const update = {
      wa_provider: data.provider,
      wa_method: "apikey" as const,
      wa_server_url:
        data.provider === "uazapi" || data.provider === "evolution" ? data.serverUrl.replace(/\/+$/, "") : null,
      wa_api_key:
        data.provider === "uazapi" || data.provider === "evolution" ? data.apiKey : null,
      wa_instance_name:
        data.provider === "uazapi" || data.provider === "evolution" ? data.instanceName : null,
      wa_meta_phone_id: data.provider === "meta" ? data.phoneNumberId : null,
      wa_meta_token: data.provider === "meta" ? data.accessToken : null,
      wa_meta_business_id: data.provider === "meta" ? data.businessAccountId : null,
    };
    const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Retorna config atual (sem expor segredos crus). */
export const getWhatsAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("profiles")
      .select(
        "wa_provider, wa_method, wa_server_url, wa_instance_name, wa_meta_phone_id, wa_meta_business_id, wa_display_name, uazapi_numero, uazapi_instance_status",
      )
      .eq("id", userId)
      .single();
    if (!p) return { connected: false as const };
    const isManaged = p.wa_provider === "uazapi" && p.wa_method === "qrcode";
    const isApiKey = p.wa_method === "apikey" && !!p.wa_provider;
    const connected =
      (isManaged && p.uazapi_instance_status === "connected") || isApiKey;
    return {
      connected,
      provider: p.wa_provider ?? null,
      method: p.wa_method ?? null,
      serverUrl: p.wa_server_url ?? null,
      instanceName: p.wa_instance_name ?? null,
      phoneNumberId: p.wa_meta_phone_id ?? null,
      businessAccountId: p.wa_meta_business_id ?? null,
      displayName: p.wa_display_name ?? null,
      numero: p.uazapi_numero ?? null,
    };
  });

// ============================================================================
// ENVIO DE MENSAGEM (roteamento por provedor)
// ============================================================================

export const sendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      numero: z.string().min(8).max(20),
      texto: z.string().min(1).max(4096),
      leadId: z.string().uuid().optional(),
      campanhaId: z.string().uuid().optional(),
      step: z.number().int().min(1).max(10).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("profiles")
      .select(
        "wa_provider, wa_method, wa_server_url, wa_api_key, wa_instance_name, wa_meta_phone_id, wa_meta_token, uazapi_instance_token, uazapi_instance_status",
      )
      .eq("id", userId)
      .single();

    const numeroLimpo = data.numero.replace(/\D+/g, "");
    const numero55 = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;

    let messageId: string | null = null;

    try {
      // UazAPI gerenciada (QR Code do servidor padrão)
      if (
        p?.wa_method === "qrcode" &&
        p?.wa_provider === "uazapi" &&
        p?.uazapi_instance_token &&
        p?.uazapi_instance_status === "connected"
      ) {
        const res = await uazSendText(p.uazapi_instance_token, numero55, data.texto);
        messageId = res.id ?? null;
      }
      // UazAPI própria
      else if (p?.wa_method === "apikey" && p?.wa_provider === "uazapi" && p?.wa_server_url && p?.wa_api_key) {
        const url = `${p.wa_server_url}/send/text`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: p.wa_api_key },
          body: JSON.stringify({ number: numero55, text: data.texto }),
        });
        if (!r.ok) throw new Error(`UAZAPI [${r.status}]: ${(await r.text()).slice(0, 300)}`);
        const j = (await r.json().catch(() => ({}))) as { messageid?: string; id?: string };
        messageId = j.messageid ?? j.id ?? null;
      }
      // Evolution
      else if (
        p?.wa_method === "apikey" &&
        p?.wa_provider === "evolution" &&
        p?.wa_server_url &&
        p?.wa_api_key &&
        p?.wa_instance_name
      ) {
        const url = `${p.wa_server_url}/message/sendText/${encodeURIComponent(p.wa_instance_name)}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: p.wa_api_key },
          body: JSON.stringify({ number: numero55, text: data.texto }),
        });
        if (!r.ok) throw new Error(`Evolution [${r.status}]: ${(await r.text()).slice(0, 300)}`);
        const j = (await r.json().catch(() => ({}))) as { key?: { id?: string } };
        messageId = j.key?.id ?? null;
      }
      // Meta
      else if (
        p?.wa_method === "apikey" &&
        p?.wa_provider === "meta" &&
        p?.wa_meta_phone_id &&
        p?.wa_meta_token
      ) {
        const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(p.wa_meta_phone_id)}/messages`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.wa_meta_token}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: numero55,
            type: "text",
            text: { body: data.texto },
          }),
        });
        if (!r.ok) throw new Error(`Meta [${r.status}]: ${(await r.text()).slice(0, 300)}`);
        const j = (await r.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
        messageId = j.messages?.[0]?.id ?? null;
      } else {
        throw new Error("WhatsApp não conectado. Conecte em /app/whatsapp.");
      }

      await supabaseAdmin.from("mensagens_enviadas").insert({
        user_id: userId,
        lead_id: data.leadId ?? null,
        campanha_id: data.campanhaId ?? null,
        texto: data.texto,
        step: data.step ?? null,
        status: "enviado",
        uazapi_message_id: messageId,
      });
      return { ok: true, messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("mensagens_enviadas").insert({
        user_id: userId,
        lead_id: data.leadId ?? null,
        campanha_id: data.campanhaId ?? null,
        texto: data.texto,
        step: data.step ?? null,
        status: "falha",
      });
      throw new Error(`Falha no envio: ${msg}`);
    }
  });
