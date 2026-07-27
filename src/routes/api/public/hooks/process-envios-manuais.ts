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
import { mensagemErro, categoriaErro } from "@/lib/traduzir-erro";
import { registrarMensagemEnviadaNaConversa } from "@/lib/ia.server";

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

/** Backoff transitório: 1min, 2min, 4min, 8min… (cap 30min). */
function backoffMs(tentativas: number) {
  const raw = 60_000 * Math.pow(2, Math.max(0, tentativas - 1));
  return Math.min(1_800_000, raw);
}

/** Backoff para rate limit: 5min, 10min, 20min, 40min… (cap 1h). */
function backoffRateLimitMs(tentativas: number) {
  const raw = 5 * 60_000 * Math.pow(2, Math.max(0, tentativas - 1));
  return Math.min(60 * 60_000, raw);
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
        const results = {
          picked: 0,
          sent: 0,
          failed: 0,
          retried: 0,
          rate_limited: 0,
          permanent_failed: 0,
          skipped_wa_off: 0,
          skipped_paused: 0,
        };

        // Recuperação: devolve para 'pendente' linhas presas em 'enviando' há > 5 min
        // desde a última atualização. Antes isso usava `agendado_para`; como a
        // data agendada pode estar bem no passado, outro tick do cron reabria o
        // mesmo item enquanto o envio ainda estava em andamento, duplicando a
        // mensagem no WhatsApp.
        const stuckThreshold = new Date(now - 5 * 60_000).toISOString();
        await supabaseAdmin
          .from("envios_manuais_fila" as never)
          .update({ status: "pendente" } as never)
          .eq("status", "enviando")
          .lte("updated_at", stuckThreshold);

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
            "id, wa_provider, wa_method, wa_server_url, wa_api_key, wa_instance_name, wa_meta_phone_id, wa_meta_token, uazapi_instance_token, uazapi_instance_status, fila_pausada",
          )
          .in("id", userIds);
        const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
        const pausados = new Set(
          (profiles ?? [])
            .filter((p) => (p as { fila_pausada?: boolean }).fila_pausada)
            .map((p) => p.id),
        );

        // Processa 1 por user por tick — evita rajada dentro do mesmo user
        // no caso de múltiplos itens vencidos ao mesmo tempo.
        const jaProcessado = new Set<string>();

        for (const item of items) {
          if (pausados.has(item.user_id)) {
            results.skipped_paused += 1;
            continue;
          }
          if (jaProcessado.has(item.user_id)) continue;
          jaProcessado.add(item.user_id);

          const profile = profileMap.get(item.user_id);
          if (!profile) continue;

          // CLAIM ATÔMICO: só processa se conseguir mover de 'pendente' → 'enviando'.
          // Evita que dois ticks concorrentes do cron peguem a mesma linha e
          // disparem a mensagem 2x para o lead.
          const { data: claimed } = await supabaseAdmin
            .from("envios_manuais_fila" as never)
            .update({ status: "enviando", tentativas: item.tentativas + 1 } as never)
            .eq("id", item.id)
            .eq("status", "pendente")
            .select("id")
            .maybeSingle();
          if (!claimed) {
            // Outro worker já pegou este item — pula sem contar como tentativa nossa.
            continue;
          }

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

            if (item.lead_id) {
              try {
                await registrarMensagemEnviadaNaConversa(item.user_id, item.lead_id, item.texto);
              } catch (e) {
                console.error(
                  "[cron-envios-manuais] falha ao registrar mensagem em ia_conversas:",
                  e,
                );
              }
            }

            // Só agora — depois do envio real confirmado pelo provedor —
            // marcamos o lead como "contatado" e registramos no histórico.
            if (item.lead_id) {
              const { data: leadRow } = await supabaseAdmin
                .from("leads")
                .select("status, history")
                .eq("id", item.lead_id)
                .maybeSingle();
              if (leadRow) {
                const historyArr = Array.isArray(leadRow.history) ? leadRow.history : [];
                const novoHist = [
                  ...historyArr,
                  {
                    text: "Mensagem WhatsApp enviada (confirmado pelo provedor)",
                    at: finishedAt.toISOString(),
                  },
                ];
                const patch: { history: unknown; status?: string } = { history: novoHist };
                if (leadRow.status === "novo") {
                  patch.status = "contatado";
                }
                await supabaseAdmin
                  .from("leads")
                  .update(patch as never)
                  .eq("id", item.lead_id);
                if (patch.status) {
                  const { logLeadStatusChange } = await import("@/lib/leads-audit.server");
                  await logLeadStatusChange({
                    leadId: item.lead_id,
                    userId: item.user_id,
                    statusAnterior: leadRow.status,
                    statusNovo: patch.status,
                    origem: "cron:process-envios-manuais",
                    detalhes: {
                      fila_id: item.id,
                      message_id: messageId,
                      campanha_id: item.campanha_id,
                    },
                  });
                }
              }
            }

            results.sent++;
          } catch (e) {
            const msg = mensagemErro(e);

            // WhatsApp desconectado: mantém pendente sem consumir tentativa,
            // reagenda para daqui a 5 min.
            if (msg === "WA_NAO_CONECTADO" || isWhatsAppDisconnectedError(msg)) {
              const proxima = new Date(now + 5 * 60_000).toISOString();
              console.warn("[cron-envios-manuais] WhatsApp desconectado", {
                item_id: item.id,
                user_id: item.user_id,
                provider: profile.wa_provider,
                method: profile.wa_method,
                status: profile.uazapi_instance_status,
              });
              await supabaseAdmin
                .from("envios_manuais_fila" as never)
                .update({
                  status: "pendente",
                  tentativas: item.tentativas, // reverte incremento do claim
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

            const categoria = categoriaErro(msg);

            // Erros permanentes (número inválido, não é WhatsApp, bloqueado,
            // banido, mídia inválida, auth) — falha imediata, sem retry
            // automático. O usuário pode clicar "tentar novamente" na UI.
            if (categoria === "permanent") {
              await supabaseAdmin
                .from("envios_manuais_fila" as never)
                .update({
                  status: "falha",
                  tentativas: item.tentativas + 1,
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

              results.permanent_failed++;
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
              const delta =
                categoria === "rate_limit"
                  ? backoffRateLimitMs(novasTentativas)
                  : backoffMs(novasTentativas);
              const proxima = new Date(now + delta).toISOString();
              await supabaseAdmin
                .from("envios_manuais_fila" as never)
                .update({
                  status: "pendente",
                  tentativas: novasTentativas,
                  agendado_para: proxima,
                  ultimo_erro: msg.slice(0, 500),
                } as never)
                .eq("id", item.id);
              if (categoria === "rate_limit") results.rate_limited++;
              else results.retried++;
            }
          }
        }

        return Response.json({ ok: true, ts: nowIso, ...results });
      },
    },
  },
});
