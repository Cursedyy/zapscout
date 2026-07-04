/**
 * Score de Oportunidade — cálculo objetivo + cache.
 * O enriquecimento com IA fica em lead-score.functions.ts.
 */
import type { MockLead } from "@/data/mock-leads";
import { isSiteProprio } from "@/lib/site-check";

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



export function calcularScoreObjetivo(lead: MockLead): { scoreObjetivo: number; detalhes: ScoreCriterio[] } {
  let score = 0;
  const detalhes: ScoreCriterio[] = [];

  // Presença web
  if (!isSiteProprio(lead.site)) {
    score += 30;
    detalhes.push({ criterio: lead.site ? "Apenas rede social como site" : "Sem site", pontos: 30, positivo: true, icone: "🌐" });
  } else {
    detalhes.push({ criterio: "Tem site próprio", pontos: 0, positivo: false, icone: "✅" });
  }

  if (!lead.telefone || !lead.telefone.trim()) {
    score += 10;
    detalhes.push({ criterio: "Sem telefone cadastrado", pontos: 10, positivo: true, icone: "📞" });
  }

  // Nota
  if (lead.avaliacao > 0 && lead.avaliacao < 4.0) {
    score += 20;
    detalhes.push({ criterio: `Nota baixa (${lead.avaliacao.toFixed(1)}★)`, pontos: 20, positivo: true, icone: "⭐" });
  } else if (lead.avaliacao >= 4.0 && lead.avaliacao <= 4.3) {
    score += 10;
    detalhes.push({ criterio: `Nota mediana (${lead.avaliacao.toFixed(1)}★)`, pontos: 10, positivo: true, icone: "⭐" });
  } else if (lead.avaliacao > 4.3) {
    detalhes.push({ criterio: `Ótima avaliação (${lead.avaliacao.toFixed(1)}★)`, pontos: 0, positivo: false, icone: "⭐" });
  }

  // Visibilidade (volume de avaliações)
  if (lead.totalAvaliacoes < 50) {
    score += 25;
    detalhes.push({ criterio: `Poucas avaliações (${lead.totalAvaliacoes})`, pontos: 25, positivo: true, icone: "💬" });
  } else if (lead.totalAvaliacoes <= 200) {
    score += 10;
    detalhes.push({ criterio: `Visibilidade média (${lead.totalAvaliacoes} avaliações)`, pontos: 10, positivo: true, icone: "💬" });
  } else {
    detalhes.push({ criterio: `Alta visibilidade (${lead.totalAvaliacoes} avaliações)`, pontos: 0, positivo: false, icone: "💬" });
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
