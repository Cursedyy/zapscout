import { useEffect, useState } from "react";

type Ripple = { id: number; x: number; y: number };

/**
 * Feedback visual global: emite um "ripple" + mini-spinner no ponto do clique.
 * Ignora cliques de teclado, botão direito e elementos não interativos.
 */
export function ClickRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  useEffect(() => {
    let nextId = 1;

    const isInteractive = (el: EventTarget | null): boolean => {
      if (!(el instanceof Element)) return false;
      return !!el.closest(
        'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], input[type="submit"], input[type="button"], label, summary, [data-ripple]',
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!isInteractive(e.target)) return;
      const id = nextId++;
      setRipples((rs) => [...rs, { id, x: e.clientX, y: e.clientY }]);
      window.setTimeout(() => {
        setRipples((rs) => rs.filter((r) => r.id !== id));
      }, 650);
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute block rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: 12,
            height: 12,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent) 0%, color-mix(in oklab, var(--primary) 0%, transparent) 70%)",
            animation: "click-ripple 600ms ease-out forwards",
          }}
        />
      ))}
      <style>{`
        @keyframes click-ripple {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.85; }
          60%  { opacity: 0.5; }
          100% { transform: translate(-50%, -50%) scale(8);   opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes click-ripple {
            0%, 100% { opacity: 0; }
          }
        }
      `}</style>
    </div>
  );
}
