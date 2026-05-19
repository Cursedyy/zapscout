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
  // Vite/Worker: definimos via env opcional ou caímos no projeto padrão
  const base =
    process.env.PUBLIC_APP_URL ||
    `https://project--${process.env.VITE_SUPABASE_PROJECT_ID ?? "20f307c2-3309-44e4-9aec-4535cdcee2be"}.lovable.app`;
  const secret = process.env.UAZAPI_WEBHOOK_SECRET ?? "";
  return `${base}/api/public/uazapi-webhook?secret=${encodeURIComponent(secret)}`;
}

/** Conecta (ou recria) a instância do usuário e retorna QR code. */
export const connectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Pega token existente do profile
    const { data: profile } = await supabase
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
        .update({ uazapi_instance_token: token, uazapi_instance_status: "connecting" })
        .eq("id", userId);
    }

    // Configura webhook (idempotente)
    try {
      await uazUpdateWebhook(token, publicWebhookUrl(), ["messages"]);
    } catch (e) {
      console.warn("Falha ao configurar webhook UAZAPI:", e);
    }

    const conn = await uazConnect(token);
    return { token, status: conn.status, qrcode: conn.qrcode ?? null };
  });

/** Status atual da instância. */
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
      // Espelha no profile
      await supabaseAdmin
        .from("profiles")
        .update({
          uazapi_instance_status: s.status,
          uazapi_numero: s.profileNumber ?? profile.uazapi_numero ?? null,
          uazapi_ultimo_ping: new Date().toISOString(),
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

/** Desconecta. */
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
      .update({ uazapi_instance_status: "desconectado" })
      .eq("id", userId);
    return { ok: true };
  });

/** Envia uma mensagem agora (chamado pela UI quando o usuário clica "enviar"). */
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("uazapi_instance_token, uazapi_instance_status")
      .eq("id", userId)
      .single();

    if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "connected") {
      throw new Error("WhatsApp não conectado. Conecte sua instância em /app/whatsapp.");
    }

    try {
      const res = await uazSendText(profile.uazapi_instance_token, data.numero, data.texto);
      await supabaseAdmin.from("mensagens_enviadas").insert({
        user_id: userId,
        lead_id: data.leadId ?? null,
        campanha_id: data.campanhaId ?? null,
        texto: data.texto,
        step: data.step ?? null,
        status: "enviado",
        uazapi_message_id: res.id ?? null,
      });
      return { ok: true, messageId: res.id ?? null };
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
