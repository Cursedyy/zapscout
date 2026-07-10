import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANOS, type PlanoId } from "@/data/planos";
import {
  uazInitInstance,
  uazConnect,
  uazStatus,
  uazDisconnect,
  uazUpdateWebhook,
} from "./uazapi.server";
import { mensagemErro } from "@/lib/traduzir-erro";



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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      const msg = mensagemErro(e);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const { data: profile } = await supabaseAdmin
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const { data: profile } = await supabaseAdmin
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
      const msg = mensagemErro(e);
      return { ok: false, error: msg, numero: null, displayName: null, status: "error" as const };
    }
  });

/** Salva credenciais (após verificação) no profile. */
export const saveWhatsAppCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveCredsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    // Verifica credenciais antes de salvar e captura status/numero/displayName
    let verifiedStatus: string = "unknown";
    let verifiedNumero: string | null = null;
    let verifiedDisplayName: string | null = null;
    try {
      if (data.provider === "uazapi") {
        const url = `${data.serverUrl.replace(/\/+$/, "")}/instance/status`;
        const res = await fetch(url, { headers: { token: data.apiKey } });
        if (!res.ok) throw new Error(`UAZAPI [${res.status}]`);
        const j = (await res.json()) as { instance?: { status?: string; profileNumber?: string; profileName?: string } };
        verifiedStatus = j.instance?.status ?? "connected";
        verifiedNumero = j.instance?.profileNumber ?? null;
        verifiedDisplayName = j.instance?.profileName ?? null;
      } else if (data.provider === "evolution") {
        const url = `${data.serverUrl.replace(/\/+$/, "")}/instance/connectionState/${encodeURIComponent(data.instanceName)}`;
        const res = await fetch(url, { headers: { apikey: data.apiKey } });
        if (!res.ok) throw new Error(`Evolution [${res.status}]`);
        const j = (await res.json()) as { instance?: { state?: string }; state?: string };
        verifiedStatus = j.instance?.state ?? j.state ?? "connected";
      } else {
        const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(data.phoneNumberId)}?fields=display_phone_number,verified_name`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${data.accessToken}` } });
        if (!res.ok) throw new Error(`Meta [${res.status}]`);
        const j = (await res.json()) as { display_phone_number?: string; verified_name?: string };
        verifiedStatus = "connected";
        verifiedNumero = j.display_phone_number ?? null;
        verifiedDisplayName = j.verified_name ?? null;
      }
    } catch (e) {
      const msg = mensagemErro(e);
      throw new Error(`Falha ao verificar credenciais: ${msg}`);
    }

    const isUazApiKey = data.provider === "uazapi";
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
      // Espelha no token/status legado para que o cron de aquecimento e demais
      // fluxos baseados em uazapi_instance_* funcionem com a API Key própria.
      uazapi_instance_token: isUazApiKey ? data.apiKey : null,
      uazapi_instance_status: verifiedStatus || "connected",
      uazapi_numero: verifiedNumero,
      uazapi_ultimo_ping: new Date().toISOString(),
      wa_display_name: verifiedDisplayName,
    };
    const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, status: verifiedStatus, numero: verifiedNumero };
  });

/** Retorna config atual (sem expor segredos crus). */
export const getWhatsAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select(
        "wa_provider, wa_method, wa_server_url, wa_instance_name, wa_meta_phone_id, wa_meta_business_id, wa_display_name, uazapi_numero, uazapi_instance_status, default_intervalo_segundos, fila_envios_ativa, fila_pausada, plano",
      )
      .eq("id", userId)
      .single();
    if (!p) return { connected: false as const };
    const isManaged = p.wa_provider === "uazapi" && p.wa_method === "qrcode";
    const isApiKey = p.wa_method === "apikey" && !!p.wa_provider;
    const status = p.uazapi_instance_status ?? null;
    const apiKeyConnected =
      p.wa_provider === "meta" ||
      (p.wa_provider === "uazapi" && status === "connected") ||
      (p.wa_provider === "evolution" && ["connected", "open"].includes(status ?? ""));
    const connected =
      (isManaged && status === "connected") || (isApiKey && apiKeyConnected);

    // Consulta uso atual da fila para exibir na UI ("X de Y usados").
    const { count: filaAtualCount } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pendente");

    const planoId = (p.plano ?? "free") as PlanoId;
    const plano = PLANOS[planoId] ?? PLANOS.free;

    return {
      connected,
      provider: p.wa_provider ?? null,
      method: p.wa_method ?? null,
      status,
      serverUrl: p.wa_server_url ?? null,
      instanceName: p.wa_instance_name ?? null,
      phoneNumberId: p.wa_meta_phone_id ?? null,
      businessAccountId: p.wa_meta_business_id ?? null,
      displayName: p.wa_display_name ?? null,
      numero: p.uazapi_numero ?? null,
      filaAtiva: p.fila_envios_ativa ?? true,
      filaPausada: (p as { fila_pausada?: boolean }).fila_pausada ?? false,
      intervaloSegundos: Number(p.default_intervalo_segundos ?? 60),
      plano: planoId,
      planoNome: plano.nome,
      filaMax: plano.fila_max,
      filaAtual: filaAtualCount ?? 0,
    };
  });

// ============================================================================
// PAUSAR / RETOMAR fila de envios manuais
// ============================================================================
export const setFilaPausada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pausada: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ fila_pausada: data.pausada } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, pausada: data.pausada };
  });

// ============================================================================
// CONFIG DE FILA (ligar/desligar espera entre envios manuais)
// ============================================================================
export const updateFilaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      filaAtiva: z.boolean(),
      intervaloSegundos: z.number().int().min(1).max(3600).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { fila_envios_ativa: boolean; default_intervalo_segundos?: number } = {
      fila_envios_ativa: data.filaAtiva,
    };
    if (typeof data.intervaloSegundos === "number") {
      patch.default_intervalo_segundos = data.intervaloSegundos;
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// ENVIO DE MENSAGEM (roteamento por provedor)
// ============================================================================

/**
 * Envia (ou enfileira) uma mensagem manual. O disparo real ao provedor WA
 * é feito pelo cron `process-envios-manuais`, respeitando o intervalo mínimo
 * configurado em `profiles.default_intervalo_segundos` — evitando rajadas
 * que podem derrubar/pausar o número no WhatsApp.
 *
 * Retorna sempre o item enfileirado + horário previsto de envio.
 */
export const sendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      numero: z.string().min(8).max(20),
      texto: z.string().min(1).max(4096),
      leadId: z.string().uuid().optional(),
      campanhaId: z.string().uuid().optional(),
      step: z.number().int().min(1).max(10).optional(),
      agendadoPara: z
        .string()
        .datetime()
        .optional()
        .refine(
          (v) => !v || new Date(v).getTime() > Date.now() - 60_000,
          { message: "agendadoPara não pode estar no passado" },
        ),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    // Validação de ownership — IDOR mitigation
    if (data.leadId) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("id", data.leadId)
        .eq("user_id", userId)
        .single();
      if (!lead) throw new Error("Lead não encontrado ou não pertence ao usuário.");
    }
    if (data.campanhaId) {
      const { data: campanha } = await supabaseAdmin
        .from("campanhas")
        .select("id")
        .eq("id", data.campanhaId)
        .eq("user_id", userId)
        .single();
      if (!campanha) throw new Error("Campanha não encontrada ou não pertence ao usuário.");
    }

    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select(
        "wa_provider, wa_method, wa_server_url, wa_api_key, wa_instance_name, wa_meta_phone_id, wa_meta_token, uazapi_instance_token, uazapi_instance_status, default_intervalo_segundos, fila_envios_ativa, plano",
      )
      .eq("id", userId)
      .single();

    if (!p?.wa_provider) {
      throw new Error("WhatsApp não conectado. Conecte em /app/whatsapp.");
    }

    // Enforce limite de fila por plano
    const planoId = (p.plano ?? "free") as PlanoId;
    const plano = PLANOS[planoId] ?? PLANOS.free;
    const filaMax = plano.fila_max;
    const { count: pendentesCount } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pendente");
    if ((pendentesCount ?? 0) >= filaMax) {
      const numeroLimpo = data.numero.replace(/\D+/g, "");
      const numero55 = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;
      const motivo = `Limite da fila atingido no plano ${plano.nome} (${pendentesCount}/${filaMax} pendentes).`;
      // Registra a recusa no histórico para auditoria (aparece na lista de recentes).
      await supabaseAdmin.from("envios_manuais_fila" as never).insert({
        user_id: userId,
        lead_id: data.leadId ?? null,
        campanha_id: data.campanhaId ?? null,
        numero: numero55,
        texto: data.texto,
        step: data.step ?? null,
        agendado_para: new Date().toISOString(),
        status: "recusada_limite",
        ultimo_erro: motivo,
      } as never);
      throw new Error(
        `${motivo} Aguarde os envios saírem ou faça upgrade do plano em /planos para aumentar o limite.`,
      );
    }

    let providerReady = false;
    if (p.wa_method === "qrcode" && p.wa_provider === "uazapi") {
      providerReady = !!p.uazapi_instance_token && p.uazapi_instance_status === "connected";
    } else if (p.wa_method === "apikey" && p.wa_provider === "uazapi") {
      providerReady = !!p.wa_server_url && !!p.wa_api_key;
      if (providerReady && p.uazapi_instance_status !== "connected") {
        try {
          const res = await fetch(`${p.wa_server_url!.replace(/\/+$/, "")}/instance/status`, {
            headers: { token: p.wa_api_key! },
          });
          if (res.ok) {
            const j = (await res.json().catch(() => ({}))) as {
              instance?: { status?: string; profileNumber?: string; profileName?: string };
            };
            const liveStatus = j.instance?.status ?? null;
            providerReady = liveStatus === "connected";
            await supabaseAdmin
              .from("profiles")
              .update({
                uazapi_instance_status: liveStatus ?? "unknown",
                uazapi_numero: j.instance?.profileNumber ?? null,
                wa_display_name: j.instance?.profileName ?? null,
                uazapi_ultimo_ping: new Date().toISOString(),
              })
              .eq("id", userId);
          } else {
            providerReady = false;
          }
        } catch {
          providerReady = false;
        }
      }
    } else if (p.wa_method === "apikey" && p.wa_provider === "evolution") {
      providerReady = !!p.wa_server_url && !!p.wa_api_key && !!p.wa_instance_name;
      if (providerReady && !["connected", "open"].includes(p.uazapi_instance_status ?? "")) {
        try {
          const res = await fetch(
            `${p.wa_server_url!.replace(/\/+$/, "")}/instance/connectionState/${encodeURIComponent(p.wa_instance_name!)}`,
            { headers: { apikey: p.wa_api_key! } },
          );
          if (res.ok) {
            const j = (await res.json().catch(() => ({}))) as { instance?: { state?: string }; state?: string };
            const liveStatus = j.instance?.state ?? j.state ?? null;
            providerReady = ["connected", "open"].includes(liveStatus ?? "");
            await supabaseAdmin
              .from("profiles")
              .update({ uazapi_instance_status: liveStatus ?? "unknown", uazapi_ultimo_ping: new Date().toISOString() })
              .eq("id", userId);
          } else {
            providerReady = false;
          }
        } catch {
          providerReady = false;
        }
      }
    } else if (p.wa_method === "apikey" && p.wa_provider === "meta") {
      providerReady = !!p.wa_meta_phone_id && !!p.wa_meta_token;
    }

    if (!providerReady) {
      throw new Error("WhatsApp desconectado. Reconecte ou verifique a API Key em /app/whatsapp antes de enfileirar novas mensagens.");
    }

    const filaAtiva = p.fila_envios_ativa !== false;
    const intervaloSeg = Math.max(1, Number(p.default_intervalo_segundos ?? 60));
    const intervaloMs = intervaloSeg * 1000;

    const nowIso = new Date().toISOString();
    const now = Date.now();
    let agendadoPara: string;

    if (data.agendadoPara) {
      // Usuário escolheu horário específico — respeita exatamente (mas nunca no passado).
      const ts = Math.max(new Date(data.agendadoPara).getTime(), now);
      agendadoPara = new Date(ts).toISOString();
    } else if (!filaAtiva) {
      // Fila de espera desligada — agenda para "agora" (o cron dispara no
      // próximo tick, sem respeitar intervalo). Maior risco de bloqueio.
      agendadoPara = new Date(now).toISOString();
    } else {
      // Fila ativa: respeita o intervalo desde o último pendente/enviado deste user.
      const { data: ultPend } = await supabaseAdmin
        .from("envios_manuais_fila" as never)
        .select("agendado_para")
        .eq("user_id", userId)
        .eq("status", "pendente")
        .order("agendado_para", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ultPendRow = ultPend as unknown as { agendado_para?: string } | null;
      const ultPendTs = ultPendRow?.agendado_para
        ? new Date(ultPendRow.agendado_para).getTime()
        : 0;

      const { data: ultEnv } = await supabaseAdmin
        .from("envios_manuais_fila" as never)
        .select("enviado_em")
        .eq("user_id", userId)
        .eq("status", "enviado")
        .not("enviado_em", "is", null)
        .order("enviado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ultEnvRow = ultEnv as unknown as { enviado_em?: string } | null;
      const ultEnvTs = ultEnvRow?.enviado_em
        ? new Date(ultEnvRow.enviado_em).getTime()
        : 0;

      const base = Math.max(ultPendTs, ultEnvTs);
      const agendadoTs = base > 0 ? base + intervaloMs : now;
      agendadoPara = new Date(Math.max(agendadoTs, now)).toISOString();
    }

    const numeroLimpo = data.numero.replace(/\D+/g, "");
    const numero55 = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;

    const { data: inserted, error } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .insert({
        user_id: userId,
        lead_id: data.leadId ?? null,
        campanha_id: data.campanhaId ?? null,
        numero: numero55,
        texto: data.texto,
        step: data.step ?? null,
        agendado_para: agendadoPara,
      } as never)
      .select("id, agendado_para")
      .single();

    if (error) throw new Error(`Falha ao enfileirar: ${error.message}`);

    const row = inserted as { id: string; agendado_para: string };
    return {
      ok: true,
      enfileirado: true,
      id: row.id,
      agendadoPara: row.agendado_para,
      esperaSegundos: Math.max(0, Math.ceil((new Date(row.agendado_para).getTime() - now) / 1000)),
      requestedAt: nowIso,
    };
  });

// ============================================================================
// LISTAR fila de envios manuais do usuário (para UI)
// ============================================================================
export const listEnviosManuaisFila = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    // Pendentes (ordem cronológica de envio)
    const { data: pendentes } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select("id, numero, texto, agendado_para, tentativas, ultimo_erro, lead_id, campanha_id, created_at")
      .eq("user_id", userId)
      .eq("status", "pendente")
      .order("agendado_para", { ascending: true })
      .limit(100);

    // Últimos processados (24h)
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recentes } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select("id, numero, texto, status, enviado_em, agendado_para, ultimo_erro, tentativas, lead_id")
      .eq("user_id", userId)
      .in("status", ["enviado", "falha", "recusada_limite"])
      .gte("created_at", desde)
      .order("enviado_em", { ascending: false, nullsFirst: false })
      .limit(30);

    // Nomes dos leads envolvidos
    const leadIds = [
      ...new Set(
        [...(pendentes ?? []), ...(recentes ?? [])]
          .map((r) => (r as { lead_id?: string | null }).lead_id)
          .filter((v): v is string => !!v),
      ),
    ];
    let leadMap = new Map<string, string>();
    if (leadIds.length > 0) {
      const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("id, nome_empresa")
        .in("id", leadIds)
        .eq("user_id", userId);
      leadMap = new Map((leads ?? []).map((l) => [l.id, l.nome_empresa ?? ""]));
    }

    const enrich = <T extends { lead_id?: string | null }>(rows: T[] | null) =>
      (rows ?? []).map((r) => ({
        ...r,
        lead_nome: r.lead_id ? (leadMap.get(r.lead_id) ?? null) : null,
      }));

    return {
      pendentes: enrich(pendentes as never as Array<{ lead_id?: string | null }>),
      recentes: enrich(recentes as never as Array<{ lead_id?: string | null }>),
      geradoEm: new Date().toISOString(),
    };
  });

// ============================================================================
// CANCELAR itens pendentes da fila (individual ou em lote)
// ============================================================================
export const cancelEnviosManuais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ids: z.array(z.string().uuid()).max(500).optional(),
        all: z.boolean().optional(),
      })
      .refine((v) => v.all || (v.ids && v.ids.length > 0), {
        message: "Informe ids ou all=true",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    let q = supabaseAdmin
      .from("envios_manuais_fila" as never)
      .delete()
      .eq("user_id", userId)
      .eq("status", "pendente");

    if (!data.all && data.ids && data.ids.length > 0) {
      q = q.in("id", data.ids);
    }

    const { data: deleted, error } = await q.select("id");
    if (error) throw new Error(`Falha ao cancelar: ${error.message}`);
    return { ok: true, cancelados: (deleted ?? []).length };
  });

// ============================================================================
// LISTAR fila com paginação + filtro por status (para a página completa)
// ============================================================================
const STATUS_FILA = ["todos", "pendente", "enviado", "falha", "recusada_limite"] as const;

export const listFilaPaginada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(STATUS_FILA).default("todos"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(20),
        busca: z.string().optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select(
        "id, numero, texto, status, agendado_para, enviado_em, tentativas, ultimo_erro, lead_id, campanha_id, created_at",
        { count: "exact" },
      )
      .eq("user_id", userId);

    if (data.status !== "todos") q = q.eq("status", data.status);

    const busca = data.busca.trim();
    if (busca) {
      const digits = busca.replace(/\D/g, "");
      const like = `%${busca}%`;
      if (digits.length >= 3) {
        q = q.or(`numero.ilike.%${digits}%,texto.ilike.${like}`);
      } else {
        q = q.ilike("texto", like);
      }
    }

    q = q
      .order("agendado_para", { ascending: data.status === "pendente" || data.status === "todos" })
      .range(from, to);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(`Falha ao listar fila: ${error.message}`);

    const list = (rows ?? []) as Array<{ lead_id?: string | null }>;
    const leadIds = [...new Set(list.map((r) => r.lead_id).filter((v): v is string => !!v))];
    let leadMap = new Map<string, string>();
    if (leadIds.length > 0) {
      const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("id, nome_empresa")
        .in("id", leadIds)
        .eq("user_id", userId);
      leadMap = new Map((leads ?? []).map((l) => [l.id, l.nome_empresa ?? ""]));
    }

    const items = list.map((r) => ({
      ...(r as Record<string, unknown>),
      lead_nome: r.lead_id ? (leadMap.get(r.lead_id) ?? null) : null,
    }));

    return {
      items,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / data.pageSize)),
    };
  });

// ============================================================================
// DETALHES de um item da fila + lead vinculado
// ============================================================================
export const getFilaItemDetalhes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: item, error } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select(
        "id, numero, texto, status, agendado_para, enviado_em, tentativas, ultimo_erro, lead_id, campanha_id, created_at",
      )
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar item: ${error.message}`);
    if (!item) throw new Error("Item da fila não encontrado");

    const leadId = (item as { lead_id?: string | null }).lead_id ?? null;
    type LeadDet = {
      id: string;
      nome_empresa: string;
      telefone: string | null;
      whatsapp: string | null;
      cidade: string | null;
      estado: string | null;
      endereco: string | null;
      categoria: string | null;
      nicho: string | null;
      avaliacao: number | null;
      total_avaliacoes: number | null;
      site_url: string | null;
      status: string | null;
      score: number | null;
      observacoes: string | null;
    };
    let lead: LeadDet | null = null;
    if (leadId) {
      const { data: l } = await supabaseAdmin
        .from("leads")
        .select(
          "id, nome_empresa, telefone, whatsapp, cidade, estado, endereco, categoria, nicho, avaliacao, total_avaliacoes, site_url, status, score, observacoes",
        )
        .eq("user_id", userId)
        .eq("id", leadId)
        .maybeSingle();
      lead = (l ?? null) as LeadDet | null;
    }

    return { item, lead };
  });

// ============================================================================
// REAGENDAR um envio pendente da fila (adiciona N dias/horas/minutos)
// ============================================================================
export const reagendarEnvioFila = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        dias: z.number().int().min(0).max(365).default(0),
        horas: z.number().int().min(0).max(23).default(0),
        minutos: z.number().int().min(0).max(59).default(0),
        base: z.enum(["agora", "atual"]).default("agora"),
      })
      .refine((v) => v.dias + v.horas + v.minutos > 0, {
        message: "Informe pelo menos 1 minuto de espera",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;

    const { data: atual, error: readErr } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .select("id, agendado_para, status")
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!atual) throw new Error("Envio não encontrado");
    const row = atual as { id: string; agendado_para: string; status: string };
    if (row.status !== "pendente") {
      throw new Error("Só é possível reagendar envios pendentes");
    }

    const baseMs =
      data.base === "atual" ? new Date(row.agendado_para).getTime() : Date.now();
    const deltaMs =
      data.dias * 86_400_000 + data.horas * 3_600_000 + data.minutos * 60_000;
    const novaData = new Date(baseMs + deltaMs).toISOString();

    const { error: updErr } = await supabaseAdmin
      .from("envios_manuais_fila" as never)
      .update({ agendado_para: novaData, tentativas: 0, ultimo_erro: null } as never)
      .eq("user_id", userId)
      .eq("id", data.id)
      .eq("status", "pendente");
    if (updErr) throw new Error(updErr.message);

    return { ok: true, agendadoPara: novaData };
  });


