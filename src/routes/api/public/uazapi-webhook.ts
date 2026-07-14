/**
 * Webhook UAZAPI — recebe respostas dos leads.
 * Configurado pela URL `/api/public/uazapi-webhook?secret=<UAZAPI_WEBHOOK_SECRET>`.
 *
 * Ao receber uma mensagem de um lead:
 *  1. Localiza o lead pelo telefone (normalizando com/sem 9º dígito e com/sem código 55).
 *  2. Se estiver em `novo` ou `contatado`, move para `respondeu` com history explícita.
 *     Se estiver em negociacao/fechado/perdido, mantém.
 *  3. Pausa `sequence_state.enabled = false` (motivo: respondeu).
 *  4. Atualiza a última `mensagens_enviadas` do lead com respondeu/resposta/respondido_em
 *     e registra também um novo row "[recebida]" para o histórico bruto.
 *  5. Dispara webhooks de integração do usuário.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processarMensagemAdmin } from "@/lib/ia.server";
import { dispararWebhooksServer } from "@/lib/webhook-dispatch.server";
import { variacoesTelefoneBR, onlyDigits } from "@/lib/telefone";
import { resolveInstanciaPorToken } from "@/lib/uazapi-resolve.server";

// Telefone pode vir como "5511999998888@s.whatsapp.net" ou só dígitos
function extractNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const at = raw.split("@")[0];
  return onlyDigits(at);
}

function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const m = message as Record<string, unknown>;
  if (typeof m.conversation === "string") return m.conversation;
  const ext = m.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const img = m.imageMessage as { caption?: string } | undefined;
  if (img?.caption) return `[imagem] ${img.caption}`;
  const vid = m.videoMessage as { caption?: string } | undefined;
  if (vid?.caption) return `[vídeo] ${vid.caption}`;
  if (m.audioMessage) return "[áudio]";
  if (m.documentMessage) return "[documento]";
  return "[mensagem]";
}

export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        if (!secret || secret !== process.env.UAZAPI_WEBHOOK_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        try {
          const event = payload.event ?? payload.type;
          if (event !== "messages" && event !== "message" && event !== "messages.upsert") {
            return new Response("ignored", { status: 200 });
          }

          const dataField = payload.data ?? payload.message ?? payload.messages;
          const arr = Array.isArray(dataField) ? dataField : [dataField];

          const instanceToken =
            (payload.token as string | undefined) ||
            (payload.instance as { token?: string } | undefined)?.token;

          if (!instanceToken) {
            console.warn("[webhook] sem token de instância");
            return new Response("no token", { status: 200 });
          }

          const resolved = await resolveInstanciaPorToken(instanceToken);
          if (!resolved) {
            console.warn("[webhook] instância sem usuário:", instanceToken.slice(0, 8));
            return new Response("unknown instance", { status: 200 });
          }
          const { userId, instanciaId } = resolved;

          for (const item of arr) {
            if (!item || typeof item !== "object") continue;
            const msg = item as Record<string, unknown>;
            const key = (msg.key as Record<string, unknown> | undefined) ?? {};
            const fromMe = Boolean(key.fromMe ?? msg.fromMe);

            const remoteJid =
              (key.remoteJid as string | undefined) ??
              (msg.remoteJid as string | undefined) ??
              (msg.from as string | undefined) ??
              (msg.chat as string | undefined);
            if (!remoteJid) continue;
            // Grupos e broadcasts de status não são conversas de lead.
            if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

            const numero = extractNumber(remoteJid);
            if (!numero) continue;

            // Dedupe: mesma mensagem pode chegar mais de uma vez do UazAPI.
            const messageId =
              (key.id as string | undefined) ??
              (msg.id as string | undefined) ??
              (msg.messageid as string | undefined);
            if (messageId) {
              const { error: dedupeErr } = await supabaseAdmin
                .from("ia_webhook_eventos" as never)
                .insert({ event_id: `${instanceToken}:${messageId}`, user_id: userId } as never);
              if (dedupeErr) {
                // 23505 = unique_violation — já processamos esse evento.
                if ((dedupeErr as { code?: string }).code === "23505") continue;
                console.warn(
                  "[webhook] falha ao registrar dedupe (seguindo mesmo assim):",
                  dedupeErr.message,
                );
              }
            }

            // Takeover: qualquer fromMe=true que CHEGA aqui é garantidamente uma
            // mensagem manual — o webhook é registrado com
            // excludeMessages: ["wasSentByApi"], então respostas que o próprio
            // uazSendText envia nunca disparam este evento.
            if (fromMe) {
              const variantesTakeover = variacoesTelefoneBR(numero);
              const orExprTakeover = variantesTakeover
                .flatMap((v) => [`whatsapp.ilike.%${v}`, `telefone.ilike.%${v}`])
                .join(",");
              const { data: leadsTakeover } = await supabaseAdmin
                .from("leads")
                .select("id")
                .eq("user_id", userId)
                .or(orExprTakeover)
                .limit(1);
              const leadTakeover = leadsTakeover?.[0];
              if (leadTakeover) {
                await supabaseAdmin
                  .from("ia_conversas")
                  .update({ ia_ativa: false, status: "pausada_manual" })
                  .eq("user_id", userId)
                  .eq("lead_id", leadTakeover.id);
                console.log("[webhook] takeover manual detectado, IA pausada:", leadTakeover.id);
              }
              continue;
            }

            const texto = extractText(msg.message ?? msg);

            // Match por variações plausíveis (com/sem 9, com/sem 55)
            const variantes = variacoesTelefoneBR(numero);
            // OR pattern: (whatsapp=v1 OR telefone=v1 OR whatsapp=v2 ...)
            const orExpr = variantes
              .flatMap((v) => [`whatsapp.ilike.%${v}`, `telefone.ilike.%${v}`])
              .join(",");

            const { data: leads } = await supabaseAdmin
              .from("leads")
              .select("id, sequence_state, status, nome_empresa, telefone, whatsapp, history")
              .eq("user_id", userId)
              .or(orExpr)
              .limit(1);

            const lead = leads?.[0];
            if (!lead) {
              console.log("[webhook] resposta de número não cadastrado:", numero);
              continue;
            }

            const seq = (lead.sequence_state as Record<string, unknown> | null) ?? null;
            const updatedSeq = seq
              ? {
                  ...seq,
                  enabled: false,
                  stoppedAt: new Date().toISOString(),
                  stoppedReason: "respondeu",
                }
              : null;

            const podeMover = lead.status === "novo" || lead.status === "contatado";
            const novoStatus = podeMover ? "respondeu" : lead.status;
            const hist = Array.isArray(lead.history) ? (lead.history as unknown[]) : [];
            const novoHist = [...hist];
            if (podeMover) {
              novoHist.push({
                ts: Date.now(),
                text: "Movido automaticamente — lead respondeu no WhatsApp",
              });
            }

            await supabaseAdmin
              .from("leads")
              .update({
                status: novoStatus,
                sequence_state: updatedSeq as never,
                history: novoHist as never,
              })
              .eq("id", lead.id);

            // Atualiza a última mensagem enviada para esse lead marcando resposta
            const { data: ultimaEnviada } = await supabaseAdmin
              .from("mensagens_enviadas")
              .select("id")
              .eq("user_id", userId)
              .eq("lead_id", lead.id)
              .eq("status", "enviado")
              .order("enviado_em", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (ultimaEnviada?.id) {
              await supabaseAdmin
                .from("mensagens_enviadas")
                .update({
                  respondeu: true,
                  resposta: texto,
                  respondido_em: new Date().toISOString(),
                })
                .eq("id", ultimaEnviada.id);
            }

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: userId,
              lead_id: lead.id,
              texto: "[recebida] " + texto,
              status: "recebido",
              respondeu: true,
              resposta: texto,
              respondido_em: new Date().toISOString(),
            });

            if (podeMover) {
              await dispararWebhooksServer(userId, "lead_status_alterado", {
                id: lead.id,
                status: "respondeu",
                nome: lead.nome_empresa,
                telefone: lead.whatsapp ?? lead.telefone,
              });
            }

            // Aciona IA de Vendas (se configurada/ativa) — best-effort
            try {
              const result = await processarMensagemAdmin(userId, lead.id, texto, instanciaId);
              if (result.tipo === "ok") {
                console.log("[webhook] IA respondeu lead", lead.id);
              } else if (result.tipo === "escalada") {
                console.log("[webhook] IA escalou lead", lead.id, result.motivo);
              }
            } catch (err) {
              console.error("[webhook] IA falhou:", err);
            }
          }

          return new Response("ok", { status: 200 });
        } catch (e) {
          console.error("[webhook] erro:", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
