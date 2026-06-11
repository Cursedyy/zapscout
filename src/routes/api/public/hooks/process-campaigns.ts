/**
 * Cron: processa campanhas (agendadas + em andamento).
 * Chamado a cada 1 min via pg_cron.
 *
 * Lógica:
 *   1. Inicia campanhas agendadas cujo agendamento <= now.
 *   2. Para cada campanha em_andamento:
 *      - se last_sent_at + (3600/limite_por_hora)s > now: pula (respeita rate)
 *      - envia próximo item pendente via UAZAPI
 *      - marca item como enviado
 *      - se sem pendentes: marca campanha como concluida
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";
import { gateCronHook } from "@/lib/hook-gate.server";

type CampItem = {
  leadId: string;
  externalId?: string;
  numero?: string | null;
  nome?: string | null;
  status: "pendente" | "enviado" | "falha" | "pulado";
  sentAt?: string;
};

function renderVars(template: string, lead: Record<string, unknown>): string {
  const vars: Record<string, string> = {
    nome: String(lead.nome_empresa ?? lead.nome ?? ""),
    empresa: String(lead.nome_empresa ?? lead.nome ?? ""),
    cidade: String(lead.cidade ?? ""),
    nicho: String(lead.nicho ?? lead.segmento ?? ""),
    avaliacao: lead.avaliacao != null ? String(lead.avaliacao) : "—",
    telefone: String(lead.telefone ?? lead.whatsapp ?? ""),
    endereco: String(lead.endereco ?? ""),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export const Route = createFileRoute("/api/public/hooks/process-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-campaigns");
        if (gate) return gate;



        const now = Date.now();
        const results = { started: 0, sent: 0, completed: 0, errors: 0, skipped: 0 };

        // 1. Inicia agendadas
        const { data: agendadas } = await supabaseAdmin
          .from("campanhas")
          .select("id, agendamento")
          .eq("status", "agendada")
          .lte("agendamento", new Date().toISOString())
          .limit(100);

        for (const c of agendadas ?? []) {
          await supabaseAdmin
            .from("campanhas")
            .update({ status: "em_andamento", started_at: new Date().toISOString() })
            .eq("id", c.id);
          results.started++;
        }

        // 2. Processa em andamento
        const { data: campanhas } = await supabaseAdmin
          .from("campanhas")
          .select("id, user_id, mensagem_override, mensagem, limite_por_hora, items, last_sent_at")
          .eq("status", "em_andamento")
          .limit(100);

        const userIds = [...new Set((campanhas ?? []).map((c) => c.user_id))];
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, uazapi_instance_token, uazapi_instance_status")
          .in("id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

        for (const c of campanhas ?? []) {
          const profile = profileMap.get(c.user_id);
          if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "connected") {
            console.warn(
              "[cron-campaigns] PAUSANDO campanha",
              c.id,
              "— perfil sem WhatsApp conectado.",
              "user_id:", c.user_id,
              "token_present:", !!profile?.uazapi_instance_token,
              "status:", profile?.uazapi_instance_status,
            );
            await supabaseAdmin
              .from("campanhas")
              .update({ status: "pausada" })
              .eq("id", c.id);
            results.skipped++;
            continue;
          }

          // Rate limit
          const intervaloMs = Math.max(1000, Math.floor(3600_000 / (c.limite_por_hora || 20)));
          const lastTs = c.last_sent_at ? new Date(c.last_sent_at).getTime() : 0;
          if (now - lastTs < intervaloMs) {
            results.skipped++;
            continue;
          }

          const items = (c.items as unknown as CampItem[]) ?? [];
          const nextIdx = items.findIndex((it) => it.status === "pendente");
          if (nextIdx === -1) {
            await supabaseAdmin.from("campanhas").update({ status: "concluida" }).eq("id", c.id);
            results.completed++;
            continue;
          }

          const item = items[nextIdx];
          const numero = item.numero ?? "";
          if (!numero) {
            items[nextIdx] = { ...item, status: "falha" };
            await supabaseAdmin
              .from("campanhas")
              .update({ items: items as never, last_sent_at: new Date().toISOString() })
              .eq("id", c.id);
            results.errors++;
            continue;
          }

          // Verifica se o lead já foi prospectado anteriormente (qualquer campanha do user, incluindo a atual)
          const { count: jaProspectado } = await supabaseAdmin
            .from("mensagens_enviadas")
            .select("id", { count: "exact", head: true })
            .eq("user_id", c.user_id)
            .eq("lead_id", item.leadId);

          if ((jaProspectado ?? 0) > 0) {
            console.log("[cron-campaigns] PULANDO lead já prospectado:", item.leadId);
            items[nextIdx] = { ...item, status: "pulado" };
            await supabaseAdmin
              .from("campanhas")
              .update({ items: items as never })
              .eq("id", c.id);
            results.skipped++;
            continue;
          }

          // Resolve lead pra renderizar variáveis
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("nome_empresa, cidade, nicho, segmento, endereco, avaliacao, telefone, whatsapp")
            .eq("id", item.leadId)
            .maybeSingle();

          const template = c.mensagem_override || c.mensagem || "";
          const texto = renderVars(template, (lead ?? {}) as Record<string, unknown>);


          try {
            const r = await uazSendText(profile.uazapi_instance_token, numero, texto);
            items[nextIdx] = { ...item, status: "enviado", sentAt: new Date().toISOString() };
            const restantes = items.filter((it) => it.status === "pendente").length;
            await supabaseAdmin
              .from("campanhas")
              .update({
                items: items as never,
                last_sent_at: new Date().toISOString(),
                status: restantes === 0 ? "concluida" : "em_andamento",
              })
              .eq("id", c.id);

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: c.user_id,
              lead_id: item.leadId,
              campanha_id: c.id,
              texto,
              status: "enviado",
              uazapi_message_id: r.id ?? null,
            });

            // Move lead para "contatado" se estiver "novo" e registra no histórico
            const { data: leadAtual } = await supabaseAdmin
              .from("leads")
              .select("status, history")
              .eq("id", item.leadId)
              .maybeSingle();
            if (leadAtual) {
              const hist = Array.isArray(leadAtual.history) ? (leadAtual.history as unknown[]) : [];
              const novoHist = [...hist, { ts: Date.now(), text: `Campanha — mensagem enviada` }];
              const novoStatus = leadAtual.status === "novo" ? "contatado" : leadAtual.status;
              await supabaseAdmin
                .from("leads")
                .update({ status: novoStatus, history: novoHist as never })
                .eq("id", item.leadId);
            }

            results.sent++;
            if (restantes === 0) results.completed++;
          } catch (e) {
            // LOG DETALHADO p/ diagnosticar por que números sem WhatsApp pausam a campanha
            const errAny = e as { message?: unknown; status?: unknown; response?: unknown; cause?: unknown; stack?: unknown; name?: unknown };
            console.error("[cron-campaigns] ===== ERRO ENVIO DETALHADO =====");
            console.error("[cron-campaigns] campanha_id:", c.id);
            console.error("[cron-campaigns] lead_id:", item.leadId);
            console.error("[cron-campaigns] numero:", numero);
            console.error("[cron-campaigns] typeof e:", typeof e);
            console.error("[cron-campaigns] e.name:", errAny?.name);
            console.error("[cron-campaigns] e.message:", errAny?.message);
            console.error("[cron-campaigns] e.status:", errAny?.status);
            console.error("[cron-campaigns] e.response:", errAny?.response);
            console.error("[cron-campaigns] e.cause:", errAny?.cause);
            console.error("[cron-campaigns] e.stack:", errAny?.stack);
            try {
              console.error("[cron-campaigns] JSON.stringify(e):", JSON.stringify(e, Object.getOwnPropertyNames(e as object)));
            } catch {
              console.error("[cron-campaigns] e (raw):", e);
            }
            console.error("[cron-campaigns] ===== FIM ERRO DETALHADO =====");

            const msg = e instanceof Error ? e.message : String(e);
            const statusMatch = msg.match(/\[(\d{3})\]/);
            const httpStatus = statusMatch ? Number(statusMatch[1]) : 0;
            const semWhats =
              httpStatus === 500 ||
              /is not on whatsapp|not.*whatsapp.*user|number.*not.*exist|invalid.*(number|jid)/i.test(
                msg,
              );
            console.error("[cron-campaigns] msg parseada:", msg);
            console.error("[cron-campaigns] httpStatus detectado:", httpStatus, "| semWhats:", semWhats, "| pausar:", httpStatus === 401 || httpStatus === 429);
            const pausar = httpStatus === 401 || httpStatus === 429;

            if (pausar) {
              // Mantém item como pendente para reprocessar quando a campanha voltar
              await supabaseAdmin
                .from("campanhas")
                .update({ status: "pausada", last_sent_at: new Date().toISOString() })
                .eq("id", c.id);
              await supabaseAdmin.from("mensagens_enviadas").insert({
                user_id: c.user_id,
                lead_id: item.leadId,
                campanha_id: c.id,
                texto,
                status: "falha",
              });
              results.errors++;
              continue;
            }

            items[nextIdx] = { ...item, status: semWhats ? "pulado" : "falha" };
            await supabaseAdmin
              .from("campanhas")
              .update({ items: items as never, last_sent_at: new Date().toISOString() })
              .eq("id", c.id);
            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: c.user_id,
              lead_id: item.leadId,
              campanha_id: c.id,
              texto,
              status: semWhats ? "pulado" : "falha",
            });

            if (semWhats) {
              const { data: leadAtual } = await supabaseAdmin
                .from("leads")
                .select("status, history")
                .eq("id", item.leadId)
                .maybeSingle();
              const hist = Array.isArray(leadAtual?.history) ? (leadAtual!.history as unknown[]) : [];
              const novoHist = [
                ...hist,
                { ts: Date.now(), text: "Campanha — sem_whatsapp (número não está no WhatsApp)" },
              ];
              await supabaseAdmin
                .from("leads")
                .update({ status: "sem_numero", history: novoHist as never })
                .eq("id", item.leadId);
              results.skipped++;
            } else {
              results.errors++;
            }
            // segue para o próximo lead no próximo tick
          }
        }

        return Response.json({ ok: true, ts: new Date().toISOString(), ...results });
      },
    },
  },
});
