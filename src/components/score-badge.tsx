import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, Sparkles } from "lucide-react";
import { UpgradeModal } from "@/components/upgrade-modal";
import { usePlano } from "@/store/app-store";
import { useServerFn } from "@tanstack/react-start";
import { enriquecerScoreIA } from "@/lib/lead-score.functions";
import type { MockLead } from "@/data/mock-leads";
import {
  calcularScoreObjetivo,
  classificar,
  getScoreCache,
  setScoreCache,
  incrementarScoreMes,
  scoresUsadosMes,
  SCORE_CORES,
  type ScoreData,
  type ScoreClassificacao,
} from "@/lib/lead-score";
import { cn } from "@/lib/utils";

const FREE_MES_LIMIT = 50;

/* ============================== Hook ============================== */

export function useLeadScore(lead: MockLead): { scoreData: ScoreData | null; loading: boolean } {
  const plano = usePlano();
  const enriquecer = useServerFn(enriquecerScoreIA);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const cached = getScoreCache(lead.id);
    if (cached) {
      setScoreData(cached);
      setLoading(false);
      return;
    }

    const { scoreObjetivo, detalhes } = calcularScoreObjetivo(lead);
    const inicial: ScoreData = {
      score: scoreObjetivo,
      classificacao: classificar(scoreObjetivo),
      detalhesObjetivos: detalhes,
      analiseIA: null,
      calculadoEm: new Date().toISOString(),
    };
    setScoreData(inicial);
    setLoading(false);

    const podeIA = plano.id !== "free" && scoresUsadosMes() < (plano.id === "free" ? FREE_MES_LIMIT : Infinity);
    if (!podeIA) {
      setScoreCache(lead.id, inicial);
      return;
    }

    (async () => {
      try {
        const analise = await enriquecer({
          data: {
            nome: lead.nome,
            nicho: lead.nicho,
            cidade: lead.cidade,
            avaliacao: lead.avaliacao,
            totalAvaliacoes: lead.totalAvaliacoes,
            temSite: !!lead.site,
            scoreObjetivo,
          },
        });
        if (cancelled) return;
        const final = Math.max(0, Math.min(100, scoreObjetivo + analise.ajusteScore));
        const enriched: ScoreData = {
          ...inicial,
          score: final,
          classificacao: classificar(final),
          analiseIA: analise,
        };
        setScoreData(enriched);
        setScoreCache(lead.id, enriched);
        incrementarScoreMes();
      } catch (err) {
        console.error(err);
        setScoreCache(lead.id, inicial);
      }
    })();

    return () => { cancelled = true; };
  }, [lead.id, plano.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { scoreData, loading };
}

/* ============================== Badge compacto ============================== */

export function ScoreBadge({
  score,
  classificacao,
  bloqueadoIA,
  onClick,
  size = "sm",
}: {
  score: number;
  classificacao: ScoreClassificacao;
  bloqueadoIA?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const cor = SCORE_CORES[classificacao];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium transition-colors",
        cor.bg, cor.text,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        onClick && "hover:opacity-80 cursor-pointer",
      )}
      title={`${cor.emoji} ${cor.label} — ${score}/100`}
    >
      <span className="text-[10px]">{cor.emoji}</span>
      <span className="font-semibold tabular-nums">{score}</span>
      <span className="opacity-60">/100</span>
      {bloqueadoIA && <Lock className="h-2.5 w-2.5 opacity-70" />}
    </button>
  );
}

/* ============================== Gauge semicircular ============================== */

export function ScoreGauge({ score }: { score: number }) {
  const angulo = (score / 100) * 180;
  const cor = score >= 75 ? "var(--color-destructive)" : score >= 45 ? "var(--color-warning)" : "var(--color-muted-foreground)";

  const polarToCartesian = (cx: number, cy: number, r: number, deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const describeArc = (cx: number, cy: number, r: number, start: number, end: number) => {
    const s = polarToCartesian(cx, cy, r, end);
    const e = polarToCartesian(cx, cy, r, start);
    const large = end - start <= 180 ? 0 : 1;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
  };

  return (
    <svg width="160" height="100" viewBox="0 0 160 100" className="mx-auto">
      <path d={describeArc(80, 88, 65, -180, 0)} fill="none" stroke="var(--color-border)" strokeWidth="12" strokeLinecap="round" />
      <path d={describeArc(80, 88, 65, -180, -180 + angulo)} fill="none" stroke={cor} strokeWidth="12" strokeLinecap="round" />
      <text x="80" y="82" textAnchor="middle" fontSize="32" fontWeight="700" fill="var(--color-foreground)">{score}</text>
      <text x="80" y="98" textAnchor="middle" fontSize="10" fill="var(--color-muted-foreground)">/ 100</text>
    </svg>
  );
}

/* ============================== Modal de detalhes ============================== */

export function ScoreDetailDialog({
  open, onClose, scoreData, leadNome, bloqueadoIA,
}: {
  open: boolean;
  onClose: () => void;
  scoreData: ScoreData | null;
  leadNome: string;
  bloqueadoIA?: boolean;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  if (!scoreData) return null;
  const cor = SCORE_CORES[scoreData.classificacao];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-normal text-muted-foreground">
              Score de Oportunidade · {leadNome}
            </DialogTitle>
          </DialogHeader>

          <div className="text-center">
            <ScoreGauge score={scoreData.score} />
            <div className={cn("text-sm font-medium mt-1", cor.text)}>
              {cor.emoji} {cor.label}
            </div>
          </div>

          {scoreData.analiseIA ? (
            <>
              <div className="rounded-lg bg-secondary/40 px-3 py-2.5 text-sm">
                💡 {scoreData.analiseIA.resumo}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-secondary/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground mb-0.5">Ponto fraco</p>
                  <p className="text-xs">{scoreData.analiseIA.pontoFraco}</p>
                </div>
                <div className="rounded-lg bg-secondary/40 px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground mb-0.5">Abordagem</p>
                  <p className="text-xs">{scoreData.analiseIA.abordagemSugerida}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/40">
                  Urgência: {scoreData.analiseIA.urgencia}
                </span>
                {scoreData.analiseIA.nichoAquecido && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                    🔥 Nicho aquecido
                  </span>
                )}
              </div>
            </>
          ) : bloqueadoIA ? (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="w-full rounded-lg border border-primary/40 bg-primary/5 px-3 py-3 text-left hover:bg-primary/10 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
                <Sparkles className="h-3.5 w-3.5" /> Desbloqueie a análise da IA
              </div>
              <p className="text-xs text-muted-foreground">
                A IA explica por que este lead é uma oportunidade, qual o ponto fraco e qual abordagem usar. Disponível no Pro.
              </p>
            </button>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">Analisando com IA…</div>
          )}

          <div>
            <p className="text-[10px] uppercase text-muted-foreground mb-1">Por que esta pontuação?</p>
            <div className="space-y-0.5">
              {scoreData.detalhesObjetivos.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{d.icone}</span>
                    <span className="text-xs">{d.criterio}</span>
                  </div>
                  <span className={cn("text-xs font-medium tabular-nums", d.positivo ? "text-destructive" : "text-muted-foreground")}>
                    {d.positivo ? `+${d.pontos}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        titulo="Análise IA é Pro"
        descricao="Veja resumo, ponto fraco e abordagem sugerida para cada lead — análise por Claude AI."
      />
    </>
  );
}
