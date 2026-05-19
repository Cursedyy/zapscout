import type { CrmLead, CrmStatus } from "@/store/app-store";

// Dias após o envio anterior (ou após startedAt para o primeiro follow-up)
export const DEFAULT_FOLLOWUP_INTERVALS_DIAS: [number, number, number] = [1, 2, 3];
export const TOTAL_STEPS = 3;
export const DIA_MS = 24 * 60 * 60 * 1000;

// Status onde a cadência continua ativa. Demais → para automaticamente.
export const STATUS_ATIVOS_SEQUENCIA: CrmStatus[] = ["novo", "contatado"];

export function isSequenciaAtiva(lead: CrmLead) {
  return !!lead.sequence?.enabled && STATUS_ATIVOS_SEQUENCIA.includes(lead.status);
}

export function proximoStep(lead: CrmLead): number | null {
  const seq = lead.sequence;
  if (!seq) return null;
  const sent = seq.sentSteps.length;
  return sent >= TOTAL_STEPS ? null : sent + 1; // 1..3
}

export function lastSendTs(lead: CrmLead): number {
  const seq = lead.sequence;
  if (!seq) return 0;
  if (seq.sentSteps.length === 0) return seq.startedAt;
  return seq.sentSteps[seq.sentSteps.length - 1].ts;
}

export function dueAtTs(lead: CrmLead, intervalos: readonly number[] = DEFAULT_FOLLOWUP_INTERVALS_DIAS): number | null {
  const step = proximoStep(lead);
  if (!step) return null;
  const idx = lead.sequence!.sentSteps.length; // 0..2
  const intervalo = intervalos[idx] ?? 1;
  return lastSendTs(lead) + intervalo * DIA_MS;
}

export type FollowUpPendente = {
  lead: CrmLead;
  step: number;
  dueAt: number;
  atrasoMs: number; // negativo = ainda não venceu
};

export function listarPendentes(
  leads: CrmLead[],
  intervalos: readonly number[] = DEFAULT_FOLLOWUP_INTERVALS_DIAS,
  agora = Date.now(),
): FollowUpPendente[] {
  const out: FollowUpPendente[] = [];
  for (const l of leads) {
    if (!isSequenciaAtiva(l)) continue;
    const step = proximoStep(l);
    const due = dueAtTs(l, intervalos);
    if (!step || due == null) continue;
    out.push({ lead: l, step, dueAt: due, atrasoMs: agora - due });
  }
  return out.sort((a, b) => b.atrasoMs - a.atrasoMs);
}

export function listarVencidos(
  leads: CrmLead[],
  intervalos: readonly number[] = DEFAULT_FOLLOWUP_INTERVALS_DIAS,
  agora = Date.now(),
) {
  return listarPendentes(leads, intervalos, agora).filter((p) => p.atrasoMs >= 0);
}

export function formatarPrazo(ms: number) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DIA_MS);
  const h = Math.floor((abs % DIA_MS) / 3600000);
  if (d > 0) return ms >= 0 ? `há ${d}d` : `em ${d}d`;
  if (h > 0) return ms >= 0 ? `há ${h}h` : `em ${h}h`;
  return ms >= 0 ? "agora" : "em breve";
}
