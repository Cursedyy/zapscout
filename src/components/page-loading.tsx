import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const PHRASES = [
  "Preparando o terreno...",
  "Organizando seus leads...",
  "Calibrando o radar de oportunidades...",
  "Conectando os pontos...",
  "Sincronizando dados...",
  "Quase lá...",
];

/**
 * Tela de loading elegante que aparece entre transições de rotas.
 * Usada como defaultPendingComponent no router.
 */
export function PageLoading() {
  const isNavigating = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });

  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (isNavigating) {
      setFadeOut(false);
      setVisible(true);
    } else if (visible) {
      setFadeOut(true);
      const t = setTimeout(() => {
        setVisible(false);
        setFadeOut(false);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [isNavigating, visible]);

  // Rotaciona frases
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-[var(--color-bg-base)] transition-opacity duration-300 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      aria-live="polite"
      aria-busy="true"
    >
      {/* Ambient glow de fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_12%,transparent)_0%,transparent_60%)]" />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_8%,transparent)_0%,transparent_60%)] animate-aurora" />
      </div>

      {/* Anéis orbitais decorativos */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/[0.08] animate-[spin_8s_linear_infinite]" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/[0.05] animate-[spin_12s_linear_infinite_reverse]" />
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/[0.04] animate-[spin_16s_linear_infinite]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo / Spinner central */}
        <div className="relative mb-8">
          {/* Glow por trás */}
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl animate-pulse" />

          {/* Anel externo girando */}
          <div className="relative flex h-20 w-20 items-center justify-center">
            <svg
              className="absolute inset-0 h-full w-full animate-[spin_1.4s_linear_infinite]"
              viewBox="0 0 80 80"
              fill="none"
            >
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="url(#spinner-grad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="170"
                strokeDashoffset="40"
              />
              <defs>
                <linearGradient id="spinner-grad" x1="0" y1="0" x2="80" y2="80">
                  <stop stopColor="var(--color-primary-light)" />
                  <stop offset="1" stopColor="var(--color-primary-dark)" />
                </linearGradient>
              </defs>
            </svg>

            {/* Anel interno reverso */}
            <svg
              className="absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)] animate-[spin_1s_linear_infinite_reverse]"
              viewBox="0 0 80 80"
              fill="none"
            >
              <circle
                cx="40"
                cy="40"
                r="34"
                stroke="url(#spinner-grad2)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="120"
                strokeDashoffset="60"
                opacity="0.5"
              />
              <defs>
                <linearGradient id="spinner-grad2" x1="80" y1="0" x2="0" y2="80">
                  <stop stopColor="var(--color-zap)" />
                  <stop offset="1" stopColor="var(--color-primary)" />
                </linearGradient>
              </defs>
            </svg>

            {/* Ícone central */}
            <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-white shadow-[0_0_20px_rgba(124,58,237,0.4)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Texto */}
        <h2 className="font-display text-lg font-semibold text-foreground tracking-tight">
          ZapScout
        </h2>
        <p
          key={phraseIndex}
          className="mt-2 text-sm text-muted-foreground animate-fade-in"
        >
          {PHRASES[phraseIndex]}
        </p>

        {/* Dots indicadores */}
        <div className="mt-5 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>

      {/* Partículas decorativas */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[
          { l: "15%", t: "20%", s: "3px", d: "0s" },
          { l: "80%", t: "30%", s: "2px", d: "0.8s" },
          { l: "70%", t: "75%", s: "4px", d: "1.6s" },
          { l: "25%", t: "70%", s: "2px", d: "2.4s" },
          { l: "50%", t: "15%", s: "3px", d: "1.2s" },
          { l: "90%", t: "60%", s: "2px", d: "0.4s" },
        ].map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-primary/30 animate-float"
            style={{
              left: p.l,
              top: p.t,
              width: p.s,
              height: p.s,
              animationDelay: p.d,
              animationDuration: `${3 + i * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
