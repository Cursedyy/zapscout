/**
 * Cron: processa follow-ups vencidos (sequências configuráveis).
 * Chamado a cada 5 min via pg_cron.
 *
 * Sistema legado (leads.sequence_state, 3 passos fixos) foi aposentado —
 * nunca disparou de verdade em produção (o botão "Cadência automática" da UI
 * nunca setava `templateMensagem`, campo exigido pra esse bloco processar
 * qualquer lead). Coluna `leads.sequence_state` continua no banco (dado
 * antigo não migrado, nunca representou sequência em andamento real), só
 * este cron parou de lê-la.
 *
 * Lógica atual: para cada sequencia_execucoes não pausada/cancelada/
 * concluída, dispara a próxima etapa vencida via UAZAPI, respeitando as
 * condições de parada configuradas na sequência (parar_ao_responder,
 * parar_ao_fechar, parar_ao_mover_crm).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import { dispararWebhooksServer } from "@/lib/webhook-dispatch.server";
import { estaInstanciaConectada } from "@/lib/uazapi-resolve.server";
import { registrarMensagemEnviadaNaConversa } from "@/lib/ia.server";

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
        const gate = await gateCronHook(request, "process-followups");
        if (gate) return gate;

        const now = Date.now();
        const seqResults = { processadas: 0, enviadas: 0, erros: 0, concluidas: 0 };

        try {
          const { data: execs } = await supabaseAdmin
            .from("sequencia_execucoes" as never)
            .select("*")
            .eq("pausada", false)
            .eq("cancelada", false)
            .eq("concluida", false)
            .limit(1000);

          type SeqEtapa = {
            ordem: number;
            intervalo: number;
            unidade: "horas" | "dias";
            mensagem: string;
          };
          type ExecEtapa = {
            ordem: number;
            status: "pendente" | "enviada" | "falha";
            agendada_para: string;
            enviada_em?: string;
          };
          type ExecRow = {
            id: string;
            user_id: string;
            sequencia_id: string;
            lead_id: string;
            etapas: ExecEtapa[];
            // Snapshot do status do lead no momento em que a execução começou —
            // usado por parar_ao_mover_crm pra detectar "moveu no CRM" (mudou
            // pra QUALQUER status diferente do inicial, não só respondeu/fechou/
            // perdeu, que já são cobertos por parar_ao_responder/parar_ao_fechar
            // separadamente). Coluna nova — ver migration, undefined até rodar.
            status_inicial?: string | null;
          };
          type SeqRow = {
            id: string;
            etapas: SeqEtapa[];
            parar_ao_responder: boolean;
            parar_ao_fechar: boolean;
            parar_ao_mover_crm: boolean;
          };

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
              .select(
                "id, nome_empresa, telefone, whatsapp, cidade, nicho, segmento, endereco, avaliacao, status, user_id",
              )
              .in("id", leadIdsAll);
            const leadMap = new Map((leadsSeq ?? []).map((l) => [l.id, l]));

            const { data: profilesAll } = await supabaseAdmin
              .from("profiles")
              .select("id, uazapi_instance_token, uazapi_instance_status, uazapi_ultimo_ping")
              .in("id", userIdsAll);
            const profMap = new Map((profilesAll ?? []).map((p) => [p.id, p]));
            const conexaoCache = new Map<string, boolean>();

            for (const exec of execList) {
              const lead = leadMap.get(exec.lead_id);
              const seq = seqMap.get(exec.sequencia_id);
              const prof = profMap.get(exec.user_id);
              if (!lead || !seq || !prof?.uazapi_instance_token) continue;
              if (!conexaoCache.has(exec.user_id)) {
                conexaoCache.set(
                  exec.user_id,
                  await estaInstanciaConectada({
                    userId: exec.user_id,
                    token: prof.uazapi_instance_token,
                    statusCache: prof.uazapi_instance_status ?? null,
                    ultimoPing: prof.uazapi_ultimo_ping ?? null,
                  }),
                );
              }
              if (!conexaoCache.get(exec.user_id)) continue;

              if (
                (seq.parar_ao_responder && lead.status === "respondeu") ||
                (seq.parar_ao_fechar && (lead.status === "fechado" || lead.status === "perdido")) ||
                (seq.parar_ao_mover_crm &&
                  exec.status_inicial != null &&
                  lead.status !== exec.status_inicial)
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
                novas[proxIdx] = {
                  ...etapa,
                  status: "enviada",
                  enviada_em: new Date().toISOString(),
                };
                const concluida = !novas.some((e) => e.status === "pendente");
                await supabaseAdmin
                  .from("sequencia_execucoes" as never)
                  .update({
                    etapas: novas as unknown as never,
                    etapa_atual: proxIdx + 1,
                    concluida,
                  } as never)
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

                try {
                  await registrarMensagemEnviadaNaConversa(exec.user_id, lead.id, texto);
                } catch (e) {
                  console.error("[cron-followups] falha ao registrar mensagem em ia_conversas:", e);
                }

                // Atualiza histórico + status do lead
                const { data: leadFull } = await supabaseAdmin
                  .from("leads")
                  .select("status, history, nome_empresa")
                  .eq("id", lead.id)
                  .maybeSingle();
                const histSeq = Array.isArray(leadFull?.history)
                  ? (leadFull!.history as unknown[])
                  : [];
                const statusSeqAntes = leadFull?.status ?? "novo";
                const moveuSeq = statusSeqAntes === "novo";
                const novoHistSeq: unknown[] = [
                  ...histSeq,
                  { ts: Date.now(), text: `Sequência — etapa ${etapa.ordem} enviada` },
                ];
                if (moveuSeq) {
                  novoHistSeq.push({
                    ts: Date.now(),
                    text: "Movido automaticamente para Contatado — mensagem enviada",
                  });
                }
                if (concluida) {
                  novoHistSeq.push({ ts: Date.now(), text: "Sequência concluída sem resposta" });
                }
                const statusSeq = moveuSeq ? "contatado" : statusSeqAntes;
                await supabaseAdmin
                  .from("leads")
                  .update({ status: statusSeq, history: novoHistSeq as never })
                  .eq("id", lead.id);
                if (moveuSeq) {
                  const { logLeadStatusChange } = await import("@/lib/leads-audit.server");
                  await logLeadStatusChange({
                    leadId: lead.id,
                    userId: exec.user_id,
                    statusAnterior: statusSeqAntes,
                    statusNovo: "contatado",
                    origem: "cron:process-followups",
                    detalhes: { sequencia_id: exec.sequencia_id, etapa: etapa.ordem },
                  });
                }

                if (moveuSeq) {
                  await dispararWebhooksServer(exec.user_id, "lead_status_alterado", {
                    id: lead.id,
                    status: "contatado",
                    nome: leadFull?.nome_empresa,
                  });
                }
                if (concluida) {
                  const nomeLead = leadFull?.nome_empresa ?? "Lead";
                  await supabaseAdmin.from("notificacoes").insert({
                    user_id: exec.user_id,
                    tipo: "followup",
                    titulo: "Sequência concluída sem resposta",
                    descricao: `${nomeLead} completou a sequência sem responder. Considere mover para Perdido ou tentar outra abordagem.`,
                    link: `/app/leads?lead=${lead.id}`,
                  });
                }
              } catch (e) {
                seqResults.erros++;
                console.error("[cron-seq] envio erro", exec.id, e);
              }
            }
          }
        } catch (e) {
          console.error("[cron-seq] erro geral", e);
        }

        return Response.json({
          ok: true,
          ts: new Date().toISOString(),
          sequencias: seqResults,
        });
      },
    },
  },
});
