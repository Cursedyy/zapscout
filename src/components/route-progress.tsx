import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Barra de progresso fininha no topo, estilo YouTube/Vercel.
 * Aparece em qualquer transição de rota (trocar de aba, carregar loader, etc).
 */
export function RouteProgress() {
  const isNavigating = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf: number;
    let timeout: ReturnType<typeof setTimeout>;

    if (isNavigating) {
      setVisible(true);
      setProgress(8);
      // sobe rápido até 80%
      const tick = () => {
        setProgress((p) => (p < 80 ? p + (80 - p) * 0.12 : p));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else if (visible) {
      // completa e some
      setProgress(100);
      timeout = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timeout) clearTimeout(timeout);
    };
  }, [isNavigating, visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none"
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${progress}%`,
          background:
            "linear-gradient(90deg, var(--color-primary), var(--color-primary-light), var(--color-zap))",
          boxShadow: "0 0 12px var(--color-primary-light)",
          transition: "width 180ms ease-out, opacity 250ms ease-out",
          opacity: progress >= 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
