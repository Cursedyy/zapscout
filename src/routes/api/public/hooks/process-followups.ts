/**
 * Cron: processa follow-ups vencidos.
 * Chamado a cada 5 min via pg_cron.
 *
 * Lógica:
 *   Para cada lead com sequence_state.enabled = true:
 *     - calcula próximo step com base em followup_dias do profile (default [1,2,3])
 *     - se dueAt <= now: envia via UAZAPI, marca sentSteps, completa se step 3
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";

const DIA_MS = 24 * 60 * 60 * 1000;

type Sequence = {
  enabled?: boolean;
  startedAt?: string;
  templateMensagem?: string;
  sentSteps?: { step: number; ts: string }[];
  stoppedAt?: string;
  stoppedReason?: string;
};

function renderVars(template: string, lead: Record<string, unknown>): string {
  const vars: Record<string, string> = {
    nome: String(lead.nome_empresa ?? ""),
    empresa: String(lead.nome_empresa ?? ""),
    cidade: String(lead.cidade ?? ""),
    nicho: String(lead.nicho ?? lead.segmento ?? ""),
    avaliacao: lead.avaliacao != null ? String(lead.avaliacao) : "—",
    telefone: String(lead.telefone ?? lead.whatsapp ?? ""),
    endereco: String(lead.endereco ?? ""),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export const Route = createFileRoute("/api/public/hooks/process-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Validação do secret do cron
        const cronSecret = request.headers.get("x-cron-secret");
        if (cronSecret !== "zapscout_cron_2025") {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = Date.now();
        const results = { processed: 0, sent: 0, errors: 0, completed: 0 };

        // Pega todos os leads com sequência ativa
        const { data: leads, error } = await supabaseAdmin
          .from("leads")
          .select(
            "id, user_id, nome_empresa, telefone, whatsapp, cidade, nicho, segmento, endereco, avaliacao, sequence_state",
          )
          .not("sequence_state", "is", null)
          .limit(500);

        if (error) {
          console.error("[cron-followups] query erro:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        // Agrupa por user_id e busca profile (token UAZAPI + followup_dias)
        const userIds = [...new Set((leads ?? []).map((l) => l.user_id))];
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, followup_dias, uazapi_instance_token, uazapi_instance_status")
          .in("id", userIds);
        const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

        for (const lead of leads ?? []) {
          const seq = (lead.sequence_state as Sequence | null) ?? null;
          if (!seq?.enabled || !seq.startedAt || !seq.templateMensagem) continue;

          const profile = profileMap.get(lead.user_id);
          if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "connected") {
            continue; // sem instância conectada, pula
          }

          const dias = (profile.followup_dias as number[] | null) ?? [1, 2, 3];
          const sentSteps = seq.sentSteps ?? [];
          const nextStep = sentSteps.length + 1;
          if (nextStep > 3) continue;

          const startedAt = new Date(seq.startedAt).getTime();
          const offsetDays = dias[nextStep - 1] ?? 1;
          const dueAt = startedAt + offsetDays * DIA_MS;
          if (dueAt > now) continue;

          results.processed++;

          const numero = (lead.whatsapp || lead.telefone || "").toString();
          if (!numero) continue;

          const texto = renderVars(seq.templateMensagem, lead as Record<string, unknown>);

          try {
            const r = await uazSendText(profile.uazapi_instance_token, numero, texto);
            results.sent++;

            const newSteps = [...sentSteps, { step: nextStep, ts: new Date().toISOString() }];
            const concluida = newSteps.length >= 3;
            const newSeq: Sequence = {
              ...seq,
              sentSteps: newSteps,
              enabled: concluida ? false : true,
              stoppedAt: concluida ? new Date().toISOString() : seq.stoppedAt,
              stoppedReason: concluida ? "concluida" : seq.stoppedReason,
            };
            if (concluida) results.completed++;

            // Atualiza histórico + status do lead
            const { data: leadAtual } = await supabaseAdmin
              .from("leads")
              .select("status, history")
              .eq("id", lead.id)
              .maybeSingle();
            const hist = Array.isArray(leadAtual?.history) ? (leadAtual!.history as unknown[]) : [];
            const novoHist = [...hist, { ts: Date.now(), text: `Follow-up automático #${nextStep} enviado` }];
            const novoStatus = leadAtual?.status === "novo" ? "contatado" : leadAtual?.status ?? "contatado";

            await supabaseAdmin
              .from("leads")
              .update({ sequence_state: newSeq as never, status: novoStatus, history: novoHist as never })
              .eq("id", lead.id);

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: lead.user_id,
              lead_id: lead.id,
              texto,
              step: nextStep,
              status: "enviado",
              uazapi_message_id: r.id ?? null,
            });
          } catch (e) {
            results.errors++;
            console.error("[cron-followups] envio erro lead", lead.id, e);
            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: lead.user_id,
              lead_id: lead.id,
              texto,
              step: nextStep,
              status: "falha",
            });
          }
        }

        // ====== Sequências configuráveis (sequencia_execucoes) ======
        const seqResults = { processadas: 0, enviadas: 0, erros: 0, concluidas: 0 };
        try {
          const { data: execs } = await supabaseAdmin
            .from("sequencia_execucoes" as never)
            .select("*")
            .eq("pausada", false)
            .eq("cancelada", false)
            .eq("concluida", false)
            .limit(1000);

          type SeqEtapa = { ordem: number; intervalo: number; unidade: "horas" | "dias"; mensagem: string };
          type ExecEtapa = { ordem: number; status: "pendente" | "enviada" | "falha"; agendada_para: string; enviada_em?: string };
          type ExecRow = { id: string; user_id: string; sequencia_id: string; lead_id: string; etapas: ExecEtapa[] };
          type SeqRow = { id: string; etapas: SeqEtapa[]; parar_ao_responder: boolean; parar_ao_fechar: boolean };

          const execList = (execs as unknown as ExecRow[]) ?? [];
          if (execList.length > 0) {
            const seqIds = [...new Set(execList.map((e) => e.sequencia_id))];
            const leadIdsAll = [...new Set(execList.map((e) => e.lead_id))];
            const userIdsAll = [...new Set(execList.map((e) => e.user_id))];

            const { data: seqs } = await supabaseAdmin
              .from("sequencias" as never)
              .select("*")
              .in("id", seqIds);
            const seqMap = new Map(((seqs as unknown as SeqRow[]) ?? []).map((s) => [s.id, s]));

            const { data: leadsSeq } = await supabaseAdmin
              .from("leads")
              .select("id, nome_empresa, telefone, whatsapp, cidade, nicho, segmento, endereco, avaliacao, status, user_id")
              .in("id", leadIdsAll);
            const leadMap = new Map((leadsSeq ?? []).map((l) => [l.id, l]));

            const { data: profilesAll } = await supabaseAdmin
              .from("profiles")
              .select("id, uazapi_instance_token, uazapi_instance_status")
              .in("id", userIdsAll);
            const profMap = new Map((profilesAll ?? []).map((p) => [p.id, p]));

            for (const exec of execList) {
              const lead = leadMap.get(exec.lead_id);
              const seq = seqMap.get(exec.sequencia_id);
              const prof = profMap.get(exec.user_id);
              if (!lead || !seq || !prof?.uazapi_instance_token || prof.uazapi_instance_status !== "connected") continue;

              if (
                (seq.parar_ao_responder && lead.status === "respondeu") ||
                (seq.parar_ao_fechar && (lead.status === "fechado" || lead.status === "perdido"))
              ) {
                await supabaseAdmin
                  .from("sequencia_execucoes" as never)
                  .update({ parada_por_resposta: true, concluida: true } as never)
                  .eq("id", exec.id);
                continue;
              }

              const proxIdx = exec.etapas.findIndex((e) => e.status === "pendente");
              if (proxIdx < 0) {
                await supabaseAdmin
                  .from("sequencia_execucoes" as never)
                  .update({ concluida: true } as never)
                  .eq("id", exec.id);
                seqResults.concluidas++;
                continue;
              }
              const etapa = exec.etapas[proxIdx];
              if (new Date(etapa.agendada_para).getTime() > now) continue;

              seqResults.processadas++;
              const etapaDef = seq.etapas.find((e) => e.ordem === etapa.ordem);
              if (!etapaDef) continue;
              const numero = (lead.whatsapp || lead.telefone || "").toString();
              if (!numero) continue;
              const texto = renderVars(etapaDef.mensagem, lead as Record<string, unknown>);

              try {
                const r = await uazSendText(prof.uazapi_instance_token, numero, texto);
                seqResults.enviadas++;
                const novas = [...exec.etapas];
                novas[proxIdx] = { ...etapa, status: "enviada", enviada_em: new Date().toISOString() };
                const concluida = !novas.some((e) => e.status === "pendente");
                await supabaseAdmin
                  .from("sequencia_execucoes" as never)
                  .update({ etapas: novas as unknown as never, etapa_atual: proxIdx + 1, concluida } as never)
                  .eq("id", exec.id);
                if (concluida) seqResults.concluidas++;
                await supabaseAdmin.from("mensagens_enviadas").insert({
                  user_id: exec.user_id,
                  lead_id: lead.id,
                  texto,
                  step: etapa.ordem,
                  status: "enviado",
                  uazapi_message_id: r.id ?? null,
                });

                // Atualiza histórico + status do lead
                const { data: leadFull } = await supabaseAdmin
                  .from("leads")
                  .select("status, history")
                  .eq("id", lead.id)
                  .maybeSingle();
                const histSeq = Array.isArray(leadFull?.history) ? (leadFull!.history as unknown[]) : [];
                const novoHistSeq = [...histSeq, { ts: Date.now(), text: `Sequência — etapa ${etapa.ordem} enviada` }];
                const statusSeq = leadFull?.status === "novo" ? "contatado" : leadFull?.status ?? "contatado";
                await supabaseAdmin
                  .from("leads")
                  .update({ status: statusSeq, history: novoHistSeq as never })
                  .eq("id", lead.id);
              } catch (e) {
                seqResults.erros++;
                console.error("[cron-seq] envio erro", exec.id, e);
              }
            }
          }
        } catch (e) {
          console.error("[cron-seq] erro geral", e);
        }

        return Response.json({ ok: true, ts: new Date().toISOString(), legacy: results, sequencias: seqResults });
      },
    },
  },
});
