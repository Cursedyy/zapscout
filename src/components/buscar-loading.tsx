import { useEffect, useState } from "react";

type Step = {
  at: number; // seconds
  icon: string;
  title: (vars: Vars) => string;
  subtitle: (vars: Vars) => string;
};

type Vars = { cidade: string; nicho: string; maxResultados: number };

const STEPS: Step[] = [
  {
    at: 0,
    icon: "🔍",
    title: () => "Iniciando busca no Google Maps...",
    subtitle: () => "Conectando com o banco de dados de negócios",
  },
  {
    at: 8,
    icon: "🗺️",
    title: (v) => `Escaneando ${v.cidade}...`,
    subtitle: (v) => `Localizando ${v.nicho} na região`,
  },
  {
    at: 20,
    icon: "📊",
    title: (v) => `Analisando ${v.maxResultados} negócios...`,
    subtitle: () => "Coletando telefones, sites e avaliações",
  },
  {
    at: 40,
    icon: "⚡",
    title: () => "Calculando score de oportunidade...",
    subtitle: () => "Identificando os leads mais quentes para você",
  },
  {
    at: 55,
    icon: "✅",
    title: () => "Finalizando...",
    subtitle: () => "Quase pronto!",
  },
];

const TOTAL = 90; // segundos esperados

export function BuscarLoading({ cidade, nicho, maxResultados }: Vars) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      setElapsed((performance.now() - start) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const stepIndex = Math.max(
    0,
    STEPS.findIndex((s, i) => {
      const next = STEPS[i + 1];
      return elapsed >= s.at && (!next || elapsed < next.at);
    }),
  );
  const step = STEPS[stepIndex];
  const vars = { cidade, nicho, maxResultados };

  // Progresso: cresce até ~95% em TOTAL segundos, depois desacelera
  const progress = Math.min(95, (elapsed / TOTAL) * 95 + 2);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
      {/* Radar de fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_18%,transparent)_0%,transparent_60%)]" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/30 animate-radar-ping" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-radar-ping [animation-delay:1s]" />
        <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 animate-radar-ping [animation-delay:2s]" />
        {/* Pontos */}
        {[
          { l: "20%", t: "30%", d: "0s" },
          { l: "75%", t: "25%", d: "0.7s" },
          { l: "30%", t: "75%", d: "1.4s" },
          { l: "80%", t: "70%", d: "2.1s" },
          { l: "55%", t: "20%", d: "1s" },
          { l: "15%", t: "55%", d: "1.8s" },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute h-2 w-2 rounded-full bg-primary animate-radar-dot"
            style={{ left: p.l, top: p.t, animationDelay: p.d }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <div
          key={stepIndex}
          className="text-6xl mb-5 animate-scale-in drop-shadow-[0_0_20px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
        >
          {step.icon}
        </div>
        <h3
          key={`t-${stepIndex}`}
          className="font-display text-xl sm:text-2xl font-semibold text-foreground mb-2 animate-fade-in"
        >
          {step.title(vars)}
        </h3>
        <p
          key={`s-${stepIndex}`}
          className="text-sm text-muted-foreground mb-8 animate-fade-in"
        >
          {step.subtitle(vars)}
        </p>

        <div className="w-full max-w-md">
          <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-[color:var(--color-zap,var(--primary))] transition-[width] duration-500 ease-out shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{Math.floor(elapsed)}s</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Step dots */}
        <div className="mt-6 flex gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= stepIndex ? "w-8 bg-primary" : "w-3 bg-primary/25"
              }`}
            />
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground/80 max-w-sm">
          A busca pode levar até 90 segundos dependendo da quantidade de
          resultados.
        </p>
      </div>

      <style>{`
        @keyframes radar-ping {
          0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
        }
        .animate-radar-ping { animation: radar-ping 3s ease-out infinite; }
        @keyframes radar-dot {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.3); box-shadow: 0 0 12px color-mix(in oklab, var(--primary) 80%, transparent); }
        }
        .animate-radar-dot { animation: radar-dot 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .animate-radar-ping, .animate-radar-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}
