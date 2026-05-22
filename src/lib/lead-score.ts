/**
 * Score de Oportunidade — cálculo objetivo + cache.
 * O enriquecimento com IA fica em lead-score.functions.ts.
 */
import type { MockLead } from "@/data/mock-leads";

export type ScoreCriterio = {
  criterio: string;
  pontos: number;
  positivo: boolean;
  icone: string;
};

export type ScoreClassificacao = "QUENTE" | "MORNO" | "FRIO";

export type AnaliseIA = {
  ajusteScore: number;
  nivelOportunidade: ScoreClassificacao;
  resumo: string;
  pontoFraco: string;
  abordagemSugerida: string;
  nichoAquecido: boolean;
  urgencia: "ALTA" | "MEDIA" | "BAIXA";
};

export type ScoreData = {
  score: number;
  classificacao: ScoreClassificacao;
  detalhesObjetivos: ScoreCriterio[];
  analiseIA: AnaliseIA | null;
  calculadoEm: string;
};

/* ============================== Cores por nível ============================== */

export const SCORE_CORES: Record<ScoreClassificacao, { bg: string; text: string; border: string; label: string; emoji: string }> = {
  QUENTE: { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive", label: "Quente", emoji: "🔥" },
  MORNO: { bg: "bg-warning/15", text: "text-warning", border: "border-warning", label: "Morno", emoji: "⚡" },
  FRIO: { bg: "bg-muted/40", text: "text-muted-foreground", border: "border-muted-foreground", label: "Frio", emoji: "❄️" },
};

export function classificar(score: number): ScoreClassificacao {
  if (score >= 75) return "QUENTE";
  if (score >= 45) return "MORNO";
  return "FRIO";
}

/* ============================== Score objetivo ============================== */

// Heurística para campos não presentes no mock (fotos / descrição / horário).
// Usamos totalAvaliacoes como proxy para presença visual.
function temFotosHeur(lead: MockLead): boolean {
  return lead.totalAvaliacoes >= 50;
}
function temDescricaoHeur(lead: MockLead): boolean {
  return lead.totalAvaliacoes >= 30 || !!lead.site;
}
function temHorarioHeur(lead: MockLead): boolean {
  return lead.totalAvaliacoes >= 20;
}

export function calcularScoreObjetivo(lead: MockLead): { scoreObjetivo: number; detalhes: ScoreCriterio[] } {
  let score = 0;
  const detalhes: ScoreCriterio[] = [];

  if (!lead.site) {
    score += 35;
    detalhes.push({ criterio: "Sem site", pontos: 35, positivo: true, icone: "🌐" });
  } else {
    detalhes.push({ criterio: "Tem site", pontos: 0, positivo: false, icone: "✅" });
  }

  if (!lead.telefone || !lead.telefone.trim()) {
    score += 10;
    detalhes.push({ criterio: "Sem telefone cadastrado", pontos: 10, positivo: true, icone: "📞" });
  }

  if (lead.avaliacao < 3.0) {
    score += 25;
    detalhes.push({ criterio: `Nota crítica (${lead.avaliacao.toFixed(1)}★)`, pontos: 25, positivo: true, icone: "⭐" });
  } else if (lead.avaliacao < 3.5) {
    score += 20;
    detalhes.push({ criterio: `Nota baixa (${lead.avaliacao.toFixed(1)}★)`, pontos: 20, positivo: true, icone: "⭐" });
  } else if (lead.avaliacao < 4.0) {
    score += 10;
    detalhes.push({ criterio: `Nota regular (${lead.avaliacao.toFixed(1)}★)`, pontos: 10, positivo: true, icone: "⭐" });
  } else {
    detalhes.push({ criterio: `Boa avaliação (${lead.avaliacao.toFixed(1)}★)`, pontos: 0, positivo: false, icone: "⭐" });
  }

  if (lead.totalAvaliacoes < 10) {
    score += 15;
    detalhes.push({ criterio: `Poucas avaliações (${lead.totalAvaliacoes})`, pontos: 15, positivo: true, icone: "💬" });
  } else if (lead.totalAvaliacoes < 30) {
    score += 8;
    detalhes.push({ criterio: `Avaliações limitadas (${lead.totalAvaliacoes})`, pontos: 8, positivo: true, icone: "💬" });
  }

  if (!temFotosHeur(lead)) {
    score += 10;
    detalhes.push({ criterio: "Poucas fotos no Google", pontos: 10, positivo: true, icone: "📷" });
  }

  if (!temDescricaoHeur(lead)) {
    score += 10;
    detalhes.push({ criterio: "Sem descrição no Google", pontos: 10, positivo: true, icone: "📝" });
  }

  if (!temHorarioHeur(lead)) {
    score += 5;
    detalhes.push({ criterio: "Sem horário cadastrado", pontos: 5, positivo: true, icone: "🕒" });
  }

  return { scoreObjetivo: Math.min(score, 100), detalhes };
}

/* ============================== Cache localStorage ============================== */

const CACHE_KEY = "zapscout:scores:v1";
const CACHE_EXPIRY_HOURS = 24;

type CacheEntry = { data: ScoreData; timestamp: number };
type Cache = Record<string, CacheEntry>;

function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getScoreCache(leadId: string): ScoreData | null {
  const cache = readCache();
  const entry = cache[leadId];
  if (!entry) return null;
  const ageH = (Date.now() - entry.timestamp) / 1000 / 3600;
  if (ageH > CACHE_EXPIRY_HOURS) return null;
  return entry.data;
}

export function setScoreCache(leadId: string, data: ScoreData): void {
  if (typeof window === "undefined") return;
  try {
    const cache = readCache();
    cache[leadId] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* noop */
  }
}

/* ============================== Mensal limit (free) ============================== */

const COUNT_KEY = "zapscout:scores:count:v1";

type CountState = { mes: string; count: number };

function getCount(): CountState {
  const mes = new Date().toISOString().slice(0, 7);
  if (typeof window === "undefined") return { mes, count: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(COUNT_KEY) || "null") as CountState | null;
    if (!raw || raw.mes !== mes) return { mes, count: 0 };
    return raw;
  } catch {
    return { mes, count: 0 };
  }
}

export function scoresUsadosMes(): number {
  return getCount().count;
}

export function incrementarScoreMes(): void {
  if (typeof window === "undefined") return;
  const cur = getCount();
  try {
    localStorage.setItem(COUNT_KEY, JSON.stringify({ mes: cur.mes, count: cur.count + 1 }));
  } catch {
    /* noop */
  }
}
