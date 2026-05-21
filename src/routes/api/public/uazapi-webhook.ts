/**
 * Webhook UAZAPI — recebe respostas dos leads.
 * Configurado pela URL `/api/public/uazapi-webhook?secret=<UAZAPI_WEBHOOK_SECRET>`.
 *
 * Quando um lead responde:
 *  1. localiza o lead pelo telefone (whatsapp/telefone)
 *  2. marca status = 'respondeu'
 *  3. pausa sequence_state.enabled = false (motivo: respondeu)
 *  4. registra em mensagens_enviadas (respondeu=true, resposta=texto)
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processarMensagemAdmin } from "@/lib/ia.server";

function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

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

          // Múltiplos formatos: pode vir como `data.key.fromMe` ou array
          const dataField = payload.data ?? payload.message ?? payload.messages;
          const arr = Array.isArray(dataField) ? dataField : [dataField];

          // Token da instância (para mapear ao usuário)
          const instanceToken =
            (payload.token as string | undefined) ||
            (payload.instance as { token?: string } | undefined)?.token;

          if (!instanceToken) {
            console.warn("[webhook] sem token de instância");
            return new Response("no token", { status: 200 });
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("uazapi_instance_token", instanceToken)
            .maybeSingle();

          if (!profile?.id) {
            console.warn("[webhook] instância sem usuário:", instanceToken.slice(0, 8));
            return new Response("unknown instance", { status: 200 });
          }
          const userId = profile.id as string;

          for (const item of arr) {
            if (!item || typeof item !== "object") continue;
            const msg = item as Record<string, unknown>;
            const key = (msg.key as Record<string, unknown> | undefined) ?? {};
            const fromMe = Boolean(key.fromMe ?? msg.fromMe);
            if (fromMe) continue; // ignora envios nossos

            const remoteJid =
              (key.remoteJid as string | undefined) ??
              (msg.remoteJid as string | undefined) ??
              (msg.from as string | undefined) ??
              (msg.chat as string | undefined);
            const numero = extractNumber(remoteJid);
            if (!numero) continue;

            const texto = extractText(msg.message ?? msg);

            // Localiza lead pelo telefone (últimos 10-11 dígitos cobrem variações DDI)
            const tail = numero.slice(-11);
            const { data: leads } = await supabaseAdmin
              .from("leads")
              .select("id, sequence_state, status")
              .eq("user_id", userId)
              .or(`whatsapp.ilike.%${tail},telefone.ilike.%${tail}`)
              .limit(1);

            const lead = leads?.[0];
            if (!lead) {
              console.log("[webhook] resposta de número não cadastrado:", numero);
              continue;
            }

            const seq = (lead.sequence_state as Record<string, unknown> | null) ?? null;
            const updatedSeq = seq
              ? { ...seq, enabled: false, stoppedAt: new Date().toISOString(), stoppedReason: "respondeu" }
              : null;

            await supabaseAdmin
              .from("leads")
              .update({
                status: lead.status === "novo" || lead.status === "contatado" ? "respondeu" : lead.status,
                sequence_state: updatedSeq as never,
              })
              .eq("id", lead.id);

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: userId,
              lead_id: lead.id,
              texto: "[recebida] " + texto,
              status: "recebido",
              respondeu: true,
              resposta: texto,
              respondido_em: new Date().toISOString(),
            });

            // Aciona IA de Vendas (se configurada/ativa) — best-effort
            try {
              const result = await processarMensagemAdmin(userId, lead.id, texto);
              if (result.tipo === "ok") {
                // TODO: enviar result.resposta via UAZAPI (uazSendText) para remoteJid
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
