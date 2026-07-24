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
import { bufferizarMensagemIA } from "@/lib/ia.server";
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
  // Formato UAZAPI (payload.message flat, não Baileys aninhado): texto vem
  // direto em message.text ou message.content.
  if (typeof m.text === "string" && m.text) return m.text;
  if (typeof m.content === "string" && m.content) return m.content;
  const img = m.imageMessage as { caption?: string } | undefined;
  if (img?.caption) return `[imagem] ${img.caption}`;
  const vid = m.videoMessage as { caption?: string } | undefined;
  if (vid?.caption) return `[vídeo] ${vid.caption}`;
  if (m.audioMessage) return "[áudio]";
  if (m.documentMessage) return "[documento]";
  console.warn(
    "########## [WEBHOOK-TRACE] extractText: shape de mensagem não reconhecido, caindo no fallback '[mensagem]'. Chaves:",
    Object.keys(m),
    "conteúdo bruto:",
    JSON.stringify(m).slice(0, 2000),
  );
  return "[mensagem]";
}

type LeadMatch = {
  id: string;
  sequence_state: unknown;
  status: string;
  nome_empresa: string;
  telefone: string | null;
  whatsapp: string | null;
  history: unknown;
};

/**
 * Busca o lead do usuário cujo telefone/whatsapp bate com o número recebido.
 * `leads.telefone`/`leads.whatsapp` são gravados em formato livre (com "+",
 * espaço, hífen — ex.: "+55 53 3225-4488"), então NUNCA compara a coluna crua
 * contra a variante só-dígitos direto (isso é o que causava o bug: ILIKE
 * "%555332254488" nunca bate contra "+55 53 3225-4488" por causa dos
 * separadores). Aqui os dois lados são normalizados (onlyDigits) antes de
 * comparar — puxa candidatos do usuário e filtra em JS, dígito a dígito.
 */
async function encontrarLeadPorNumero(userId: string, numero: string): Promise<LeadMatch | null> {
  const variantes = new Set(variacoesTelefoneBR(numero));
  if (variantes.size === 0) return null;

  const { data: candidatos } = await supabaseAdmin
    .from("leads")
    .select("id, sequence_state, status, nome_empresa, telefone, whatsapp, history")
    .eq("user_id", userId)
    .or("telefone.not.is.null,whatsapp.not.is.null")
    .limit(5000);

  for (const lead of (candidatos ?? []) as unknown as LeadMatch[]) {
    if (
      (lead.telefone && variantes.has(onlyDigits(lead.telefone))) ||
      (lead.whatsapp && variantes.has(onlyDigits(lead.whatsapp)))
    ) {
      return lead;
    }
  }
  return null;
}

export const Route = createFileRoute("/api/public/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        console.log(
          "########## [WEBHOOK-TRACE] requisição recebida em /api/public/uazapi-webhook — secret presente:",
          Boolean(secret),
          "secret bate com UAZAPI_WEBHOOK_SECRET:",
          Boolean(
            secret &&
            process.env.UAZAPI_WEBHOOK_SECRET &&
            secret === process.env.UAZAPI_WEBHOOK_SECRET,
          ),
        );
        if (!secret || secret !== process.env.UAZAPI_WEBHOOK_SECRET) {
          console.warn(
            "########## [WEBHOOK-TRACE] SAÍDA: 401 Unauthorized (secret ausente ou não bate)",
          );
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          console.warn("########## [WEBHOOK-TRACE] SAÍDA: 400 Bad JSON (request.json() falhou)");
          return new Response("Bad JSON", { status: 400 });
        }
        console.log(
          "########## [WEBHOOK-TRACE] payload parseado, chaves de topo:",
          Object.keys(payload),
          "payload completo:",
          JSON.stringify(payload),
        );

        try {
          const event = payload.event ?? payload.type ?? payload.EventType;
          console.log("########## [WEBHOOK-TRACE] event/type detectado:", event);
          if (event !== "messages" && event !== "message" && event !== "messages.upsert") {
            console.warn(
              "########## [WEBHOOK-TRACE] SAÍDA: 200 ignored (event não reconhecido):",
              event,
            );
            return new Response("ignored", { status: 200 });
          }

          const dataField = payload.data ?? payload.message ?? payload.messages;
          const arr = Array.isArray(dataField) ? dataField : [dataField];

          const instanceToken =
            (payload.token as string | undefined) ||
            (payload.instance as { token?: string } | undefined)?.token;

          if (!instanceToken) {
            console.warn(
              "########## [WEBHOOK-TRACE] SAÍDA: 200 no token — payload não trouxe payload.token nem payload.instance.token",
            );
            return new Response("no token", { status: 200 });
          }

          const resolved = await resolveInstanciaPorToken(instanceToken);
          if (!resolved) {
            console.warn(
              "########## [WEBHOOK-TRACE] SAÍDA: 200 unknown instance — nenhum profile/instância com token:",
              instanceToken.slice(0, 8) + "...",
            );
            return new Response("unknown instance", { status: 200 });
          }
          const { userId, instanciaId } = resolved;
          console.log(
            "########## [WEBHOOK-TRACE] instância resolvida — userId:",
            userId,
            "instanciaId:",
            instanciaId,
            "itens no payload:",
            arr.length,
          );

          for (const [idx, item] of arr.entries()) {
            if (!item || typeof item !== "object") {
              console.warn(
                "########## [WEBHOOK-TRACE] item[" + idx + "] pulado: não é objeto:",
                item,
              );
              continue;
            }
            const msg = item as Record<string, unknown>;
            const key = (msg.key as Record<string, unknown> | undefined) ?? {};
            const fromMe = Boolean(key.fromMe ?? msg.fromMe);

            // Payload real da UAZAPI: dataField = payload.message (objeto único,
            // não array Baileys aninhado) — chatid/sender_pn ficam direto na raiz
            // de msg, não em msg.message (isso não existe nesse formato).
            // key.remoteJid/msg.remoteJid/msg.from/msg.chat continuam checados
            // primeiro por compatibilidade com outros formatos de payload já vistos.
            const remoteJid =
              (key.remoteJid as string | undefined) ??
              (msg.remoteJid as string | undefined) ??
              (msg.from as string | undefined) ??
              (msg.chat as string | undefined) ??
              (msg.chatid as string | undefined) ??
              (msg.sender_pn as string | undefined);
            console.log(
              "########## [WEBHOOK-TRACE] item[" + idx + "] — remoteJid:",
              remoteJid,
              "fromMe:",
              fromMe,
            );
            if (!remoteJid) {
              console.warn("########## [WEBHOOK-TRACE] item[" + idx + "] pulado: sem remoteJid");
              continue;
            }
            // Grupos e broadcasts de status não são conversas de lead.
            if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
              console.warn(
                "########## [WEBHOOK-TRACE] item[" + idx + "] pulado: grupo/broadcast:",
                remoteJid,
              );
              continue;
            }

            const numero = extractNumber(remoteJid);
            if (!numero) {
              console.warn(
                "########## [WEBHOOK-TRACE] item[" +
                  idx +
                  "] pulado: extractNumber vazio pra remoteJid:",
                remoteJid,
              );
              continue;
            }

            // Dedupe: mesma mensagem pode chegar mais de uma vez do UazAPI.
            const messageId =
              (key.id as string | undefined) ??
              (msg.id as string | undefined) ??
              (msg.messageid as string | undefined);
            console.log(
              "########## [WEBHOOK-TRACE] item[" + idx + "] — numero:",
              numero,
              "messageId:",
              messageId,
            );
            if (messageId) {
              const { error: dedupeErr } = await supabaseAdmin
                .from("ia_webhook_eventos" as never)
                .insert({ event_id: `${instanceToken}:${messageId}`, user_id: userId } as never);
              if (dedupeErr) {
                // 23505 = unique_violation — já processamos esse evento.
                if ((dedupeErr as { code?: string }).code === "23505") {
                  console.warn(
                    "########## [WEBHOOK-TRACE] item[" +
                      idx +
                      "] pulado: dedupe (já processado), event_id:",
                    `${instanceToken.slice(0, 8)}...:${messageId}`,
                  );
                  continue;
                }
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
              const textoTakeover = extractText(msg.message ?? msg);
              console.warn(
                "########## [WEBHOOK-TRACE] item[" +
                  idx +
                  "] tratado como fromMe=true (takeover), NÃO vai pra IA. Se isso é uma mensagem real do lead, o campo fromMe do payload está sendo lido errado. Texto da mensagem tratada como takeover:",
                textoTakeover,
              );
              const leadTakeover = await encontrarLeadPorNumero(userId, numero);
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

            // Match por variações plausíveis (com/sem 9, com/sem 55) — normaliza
            // telefone/whatsapp da coluna (só dígitos) antes de comparar.
            const lead = await encontrarLeadPorNumero(userId, numero);
            if (!lead) {
              console.warn(
                "########## [WEBHOOK-TRACE] item[" +
                  idx +
                  "] pulado: nenhum lead casou com numero:",
                numero,
                "variantes tentadas:",
                variacoesTelefoneBR(numero),
                "— campos crus do item pra conferir de onde tirar o telefone certo:",
                "msg.sender_pn:",
                msg.sender_pn,
                "msg.owner:",
                msg.owner,
                "key.remoteJid:",
                key.remoteJid,
                "msg.from:",
                msg.from,
                "msg.chat:",
                msg.chat,
              );
              continue;
            }
            console.log(
              "########## [WEBHOOK-TRACE] item[" + idx + "] — lead encontrado:",
              lead.id,
              lead.nome_empresa,
            );

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

            // Debounce: NÃO aciona a IA na hora — só empilha a mensagem no
            // buffer da conversa. Quem decide quando processar (8s de
            // silêncio, teto ~28s) e chama a IA é o cron
            // process-ia-debounce.ts, com o texto consolidado do lote.
            console.log(
              "########## [WEBHOOK-TRACE] item[" +
                idx +
                "] — empilhando no buffer de debounce, texto:",
              texto,
            );
            try {
              await bufferizarMensagemIA(userId, lead.id, texto, instanciaId);
            } catch (err) {
              console.error("[webhook] falha ao empilhar mensagem no buffer de debounce:", err);
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
