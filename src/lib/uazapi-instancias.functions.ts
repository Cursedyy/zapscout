/**
 * Gerencia instâncias UazAPI extras (ex.: prospecção dedicada), separadas da
 * instância principal em profiles.uazapi_instance_token. Mesmo padrão de
 * connectWhatsApp/statusWhatsApp/disconnectWhatsApp em whatsapp.functions.ts,
 * mas gravando em uazapi_instancias em vez de profiles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  uazInitInstance,
  uazConnect,
  uazStatus,
  uazDisconnect,
  uazUpdateWebhook,
} from "./uazapi.server";
import { publicWebhookUrl } from "./whatsapp.functions";
import { mensagemErro } from "@/lib/traduzir-erro";

const tipoSchema = z.enum(["prospeccao", "secundaria"]);

type InstanciaRow = {
  id: string;
  token: string | null;
  status: string;
  numero: string | null;
};

export const criarInstanciaExtra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tipo: tipoSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: existente, error: lookupError } = await supabaseAdmin
      .from("uazapi_instancias" as never)
      .select("id, token, status, numero")
      .eq("user_id", userId)
      .eq("tipo", data.tipo)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    let row = existente as unknown as InstanciaRow | null;

    if (!row?.token) {
      const created = await uazInitInstance(`zapscout_${data.tipo}_${userId.slice(0, 8)}`);
      const { data: inserted, error } = await supabaseAdmin
        .from("uazapi_instancias" as never)
        .upsert(
          { user_id: userId, tipo: data.tipo, token: created.token, status: "connecting" } as never,
          { onConflict: "user_id,tipo" },
        )
        .select("id, token, status, numero")
        .single();
      if (error) throw new Error(error.message);
      row = inserted as unknown as InstanciaRow;
    }

    try {
      await uazUpdateWebhook(row.token!, publicWebhookUrl(), ["messages"]);
    } catch (e) {
      console.warn("Falha ao configurar webhook UAZAPI (instância extra):", e);
    }

    try {
      const conn = await uazConnect(row.token!);
      return { id: row.id, status: conn.status, qrcode: conn.qrcode ?? null };
    } catch (e) {
      throw new Error(`Não foi possível gerar o QR Code: ${mensagemErro(e)}`);
    }
  });

export const statusInstanciaExtra = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tipo: tipoSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: row } = await supabaseAdmin
      .from("uazapi_instancias" as never)
      .select("id, token, status, numero")
      .eq("user_id", userId)
      .eq("tipo", data.tipo)
      .maybeSingle();
    const instancia = row as unknown as InstanciaRow | null;

    if (!instancia?.token) {
      return { status: "desconectado" as const, qrcode: null, numero: null };
    }

    try {
      const s = await uazStatus(instancia.token);
      await supabaseAdmin
        .from("uazapi_instancias" as never)
        .update({
          status: s.status,
          numero: s.profileNumber ?? instancia.numero ?? null,
          ultimo_ping: new Date().toISOString(),
          ...(s.status === "connected" ? { conectado_em: new Date().toISOString() } : {}),
        } as never)
        .eq("id", instancia.id);
      return {
        status: s.status,
        qrcode: s.qrcode ?? null,
        numero: s.profileNumber ?? instancia.numero ?? null,
      };
    } catch (e) {
      console.error("uazStatus (instância extra) erro:", e);
      return { status: instancia.status, qrcode: null, numero: instancia.numero };
    }
  });

export const desconectarInstanciaExtra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tipo: tipoSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: row } = await supabaseAdmin
      .from("uazapi_instancias" as never)
      .select("id, token")
      .eq("user_id", userId)
      .eq("tipo", data.tipo)
      .maybeSingle();
    const instancia = row as unknown as { id: string; token: string | null } | null;

    if (instancia?.token) {
      try {
        await uazDisconnect(instancia.token);
      } catch (e) {
        console.warn("disconnect (instância extra):", e);
      }
      await supabaseAdmin
        .from("uazapi_instancias" as never)
        .update({ status: "desconectado", numero: null } as never)
        .eq("id", instancia.id);
    }
    return { ok: true };
  });
