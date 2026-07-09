import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

const MIN_VISIBLE_MS = 1_800;
const FADE_OUT_MS = 500;

export function Preloader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Aguarda o load completo da página (ou timeout mínimo) antes de iniciar fade-out
    const start = performance.now();
    const hide = () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

      const timer = setTimeout(() => {
        setFading(true);
        setTimeout(() => setVisible(false), FADE_OUT_MS);
      }, remaining);

      return () => clearTimeout(timer);
    };

    if (document.readyState === "complete") {
      return hide();
    }

    const onLoad = () => {
      const cleanup = hide();
      window.removeEventListener("load", onLoad);
      return cleanup;
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[200] grid place-items-center bg-[#07070a] transition-opacity duration-500 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 0%, rgba(59,130,246,0.12), transparent 40%), #07070a",
      }}
    >
      <div className="flex flex-col items-center gap-5">
        <div
          className={`relative flex items-center justify-center w-20 h-20 rounded-2xl transition-all duration-700 ${
            mounted ? "scale-100 opacity-100" : "scale-90 opacity-0"
          }`}
          style={{
            background: "var(--gradient-primary)",
            boxShadow: "0 0 40px rgba(59,130,246,0.35)",
          }}
        >
          <Zap className="w-9 h-9 text-white" strokeWidth={2.5} />
          {/* Anel pulsante */}
          <span className="absolute inset-0 rounded-2xl border border-white/20 animate-ping" />
        </div>

        <div className="text-center space-y-1.5">
          <h2
            className="text-xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ZapScout
          </h2>
          <p className="text-xs text-muted-foreground">Carregando experiência…</p>
        </div>

        {/* Barra de progresso indeterminada */}
        <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-primary animate-preloader-bar" />
        </div>
      </div>

      <style>{`
        @keyframes preloader-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(300%); }
        }
        .animate-preloader-bar {
          animation: preloader-bar 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
