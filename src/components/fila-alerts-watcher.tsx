import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useHasSession } from "@/hooks/use-has-session";
import { getWhatsAppConfig, listEnviosManuaisFila } from "@/lib/whatsapp.functions";

/**
 * Watcher global de alertas da fila.
 *
 * Roda em qualquer página do /app: polling a cada 30s do tamanho da fila +
 * limite do plano, dispara toast + Notification do navegador quando cruza
 * 80% (perto) e 100% (cheio). Alertas só aparecem UMA vez por transição —
 * cai de volta para "ok" antes de re-alertar.
 *
 * Persistência do último nível fica em sessionStorage para não repetir o
 * alerta a cada navegação entre páginas do app.
 */
const KEY = "zs:fila-alert-level";

type Level = "ok" | "perto" | "cheio";

export function FilaAlertsWatcher() {
  const hasSession = useHasSession();
  const cfgFn = useServerFn(getWhatsAppConfig);
  const listFn = useServerFn(listEnviosManuaisFila);
  const lastRef = useRef<Level | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => cfgFn(),
    enabled: hasSession === true,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: fila } = useQuery({
    queryKey: ["fila-envios-manuais"],
    queryFn: () => listFn(),
    enabled: hasSession === true,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    if (!cfg || !("filaMax" in cfg)) return;
    const filaMax = cfg.filaMax ?? 0;
    if (filaMax <= 0) return;
    const total = (fila?.pendentes?.length ?? 0) as number;
    const pct = Math.min(100, Math.round((total / filaMax) * 100));
    const level: Level = total >= filaMax ? "cheio" : total / filaMax >= 0.8 ? "perto" : "ok";

    // Hidrata do sessionStorage no primeiro tick
    if (lastRef.current === null) {
      try {
        const v = sessionStorage.getItem(KEY) as Level | null;
        lastRef.current = v ?? "ok";
      } catch {
        lastRef.current = "ok";
      }
    }
    const prev = lastRef.current;
    if (level === prev) return;
    lastRef.current = level;
    try { sessionStorage.setItem(KEY, level); } catch { /* ignore */ }

    const canNotify =
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted";

    if (level === "cheio" && prev !== "cheio") {
      const msg = `Fila cheia (${total}/${filaMax}) — novos envios serão recusados.`;
      toast.error(msg, { duration: 8000 });
      if (canNotify) {
        try {
          new Notification("Fila do WhatsApp cheia", { body: msg, tag: "fila-cheio" });
        } catch { /* ignore */ }
      }
    } else if (level === "perto" && prev === "ok") {
      const msg = `Fila em ${pct}% (${total}/${filaMax}) — considere fazer upgrade.`;
      toast.warning(msg, { duration: 6000 });
      if (canNotify) {
        try {
          new Notification("Fila do WhatsApp quase cheia", { body: msg, tag: "fila-perto" });
        } catch { /* ignore */ }
      }
    }
  }, [cfg, fila]);

  return null;
}
