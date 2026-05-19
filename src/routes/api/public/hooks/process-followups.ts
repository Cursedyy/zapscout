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
      POST: async () => {
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

            await supabaseAdmin
              .from("leads")
              .update({ sequence_state: newSeq as never })
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

        return Response.json({ ok: true, ts: new Date().toISOString(), ...results });
      },
    },
  },
});
