/**
 * Cron: processa a fila de envios manuais (`envios_manuais_fila`).
 * Chamado a cada 1 min via pg_cron.
 *
 * Regras:
 *   - Só processa linhas com status='pendente' e agendado_para <= now.
 *   - Faz o disparo usando o provedor WA do usuário (UAZAPI gerenciado,
 *     UAZAPI próprio, Evolution, Meta).
 *   - Em sucesso: marca 'enviado', grava enviado_em e uazapi_message_id, e
 *     insere em mensagens_enviadas (para o CRM e webhooks já existentes).
 *   - Em falha: incrementa tentativas, mantém 'pendente' com backoff simples
 *     (1min, 2min, 4min…) até 5 tentativas; depois marca 'falha'.
 *   - Se o WhatsApp não estiver conectado: mantém como pendente e não conta
 *     como tentativa (aguarda reconexão).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import { uazSendText } from "@/lib/uazapi.server";

type FilaRow = {
  id: string;
  user_id: string;
  lead_id: string | null;
  campanha_id: string | null;
  numero: string;
  texto: string;
  step: number | null;
  agendado_para: string;
  status: string;
  tentativas: number;
};

const MAX_TENTATIVAS = 5;

function isWhatsAppDisconnectedError(message: string) {
  return /whatsapp\s+disconnected|session\s+is\s+not\s+reconnectable|not\s+connected|instance\s+disconnected|connection\s+closed|disconnected/i.test(
    message,
  );
}

function providerBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function backoffMs(tentativas: number) {
  const raw = 60_000 * Math.pow(2, Math.max(0, tentativas - 1));
  return Math.min(1_800_000, raw);
}

async function dispatchWhatsApp(
  profile: {
    wa_provider: string | null;
    wa_method: string | null;
    wa_server_url: string | null;
    wa_api_key: string | null;
    wa_instance_name: string | null;
    wa_meta_phone_id: string | null;
    wa_meta_token: string | null;
    uazapi_instance_token: string | null;
    uazapi_instance_status: string | null;
  },
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
    const url = `${providerBaseUrl(profile.wa_server_url)}/message/sendText/${encodeURIComponent(profile.wa_instance_name)}`;
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
    const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(profile.wa_meta_phone_id)}/messages`;
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

export const Route = createFileRoute("/api/public/hooks/process-envios-manuais")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-envios-manuais");
        if (gate) return gate;

        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const results = { picked: 0, sent: 0, failed: 0, retried: 0, skipped_wa_off: 0 };

        // Pega até 200 itens vencidos; ordena por agendado (FIFO)
        const { data: rows, error } = await supabaseAdmin
          .from("envios_manuais_fila" as never)
          .select(
            "id, user_id, lead_id, campanha_id, numero, texto, step, agendado_para, status, tentativas",
          )
          .eq("status", "pendente")
          .lte("agendado_para", nowIso)
          .order("agendado_para", { ascending: true })
          .limit(200);

        if (error) {
          console.error("[cron-envios-manuais] query erro:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const items = (rows as unknown as FilaRow[]) ?? [];
        results.picked = items.length;
        if (items.length === 0) {
          return Response.json({ ok: true, ts: nowIso, ...results });
        }

        // Carrega perfis WA de todos os users envolvidos numa tacada
        const userIds = [...new Set(items.map((r) => r.user_id))];
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select(
            "id, wa_provider, wa_method, wa_server_url, wa_api_key, wa_instance_name, wa_meta_phone_id, wa_meta_token, uazapi_instance_token, uazapi_instance_status",
          )
          .in("id", userIds);
        const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

        // Processa 1 por user por tick — evita rajada dentro do mesmo user
        // no caso de múltiplos itens vencidos ao mesmo tempo.
        const jaProcessado = new Set<string>();

        for (const item of items) {
          if (jaProcessado.has(item.user_id)) continue;
          jaProcessado.add(item.user_id);

          const profile = profileMap.get(item.user_id);
          if (!profile) continue;

          try {
            const { messageId } = await dispatchWhatsApp(profile, item.numero, item.texto);
            const finishedAt = new Date();
            await supabaseAdmin
              .from("envios_manuais_fila" as never)
              .update({
                status: "enviado",
                enviado_em: finishedAt.toISOString(),
                uazapi_message_id: messageId,
                tentativas: item.tentativas + 1,
              } as never)
              .eq("id", item.id);

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: item.user_id,
              lead_id: item.lead_id,
              campanha_id: item.campanha_id,
              texto: item.texto,
              step: item.step,
              status: "enviado",
              uazapi_message_id: messageId,
            });

            results.sent++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);

            // WhatsApp desconectado: mantém pendente sem consumir tentativa,
            // reagenda para daqui a 5 min.
            if (msg === "WA_NAO_CONECTADO" || isWhatsAppDisconnectedError(msg)) {
              const proxima = new Date(now + 5 * 60_000).toISOString();
              await supabaseAdmin
                .from("envios_manuais_fila" as never)
                .update({
                  agendado_para: proxima,
                  ultimo_erro:
                    "WhatsApp desconectado no provedor — reconecte o número para a fila continuar.",
                } as never)
                .eq("id", item.id);
              await supabaseAdmin
                .from("profiles")
                .update({ uazapi_instance_status: "disconnected" })
                .eq("id", item.user_id);
              results.skipped_wa_off++;
              continue;
            }

            const novasTentativas = item.tentativas + 1;
            if (novasTentativas >= MAX_TENTATIVAS) {
              await supabaseAdmin
                .from("envios_manuais_fila" as never)
                .update({
                  status: "falha",
                  tentativas: novasTentativas,
                  ultimo_erro: msg.slice(0, 500),
                } as never)
                .eq("id", item.id);

              await supabaseAdmin.from("mensagens_enviadas").insert({
                user_id: item.user_id,
                lead_id: item.lead_id,
                campanha_id: item.campanha_id,
                texto: item.texto,
                step: item.step,
                status: "falha",
              });

              results.failed++;
            } else {
              const proxima = new Date(now + backoffMs(novasTentativas)).toISOString();
              await supabaseAdmin
                .from("envios_manuais_fila" as never)
                .update({
                  tentativas: novasTentativas,
                  agendado_para: proxima,
                  ultimo_erro: msg.slice(0, 500),
                } as never)
                .eq("id", item.id);
              results.retried++;
            }
          }
        }

        return Response.json({ ok: true, ts: nowIso, ...results });
      },
    },
  },
});
