import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { useHasSession } from "@/hooks/use-has-session";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppConfig, listEnviosManuaisFila } from "@/lib/whatsapp.functions";

/**
 * Watcher global de alertas da fila.
 *
 * Roda em qualquer página do /app: polling a cada 30s do tamanho da fila +
 * limite do plano e do estado da fila (ativa/pausada). Quando cruza um
 * limiar (80%, 100%, pausada, desativada), insere UMA notificação na
 * central de notificações da página (sino), sem toasts nem Notification
 * do navegador — todos os avisos aparecem só no sininho.
 *
 * Dedup por nível/transição em sessionStorage para não repetir o alerta
 * a cada navegação entre páginas do app.
 */
const KEY_NIVEL = "zs:fila-alert-level";
const KEY_PAUSADA = "zs:fila-alert-pausada";
const KEY_DESATIVADA = "zs:fila-alert-desativada";

type Level = "ok" | "perto" | "cheio";

async function notificar(payload: {
  tipo: string;
  titulo: string;
  descricao?: string;
  link?: string;
}) {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    await supabase.from("notificacoes").insert({
      user_id: uid,
      tipo: payload.tipo,
      titulo: payload.titulo,
      descricao: payload.descricao ?? null,
      link: payload.link ?? null,
    });
  } catch {
    /* silencioso — alerta é best-effort */
  }
}

export function FilaAlertsWatcher() {
  const hasSession = useHasSession();
  const cfgFn = useServerFn(getWhatsAppConfig);
  const listFn = useServerFn(listEnviosManuaisFila);
  const lastLevelRef = useRef<Level | null>(null);
  const lastPausadaRef = useRef<boolean | null>(null);
  const lastDesativadaRef = useRef<boolean | null>(null);

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
    const filaAtiva = "filaAtiva" in cfg ? cfg.filaAtiva !== false : true;
    const filaPausada = "filaPausada" in cfg ? cfg.filaPausada === true : false;
    const total = (fila?.pendentes?.length ?? 0) as number;

    // ---- Nível de uso (perto/cheio) ----
    if (filaMax > 0) {
      const pct = Math.min(100, Math.round((total / filaMax) * 100));
      const level: Level =
        total >= filaMax ? "cheio" : total / filaMax >= 0.8 ? "perto" : "ok";

      if (lastLevelRef.current === null) {
        try {
          const v = sessionStorage.getItem(KEY_NIVEL) as Level | null;
          lastLevelRef.current = v ?? "ok";
        } catch {
          lastLevelRef.current = "ok";
        }
      }
      const prev = lastLevelRef.current;
      if (level !== prev) {
        lastLevelRef.current = level;
        try { sessionStorage.setItem(KEY_NIVEL, level); } catch { /* ignore */ }

        if (level === "cheio" && prev !== "cheio") {
          notificar({
            tipo: "whatsapp",
            titulo: "Fila do WhatsApp cheia",
            descricao: `${total}/${filaMax} mensagens — novos envios serão recusados até liberar espaço.`,
            link: "/planos",
          });
        } else if (level === "perto" && prev === "ok") {
          notificar({
            tipo: "whatsapp",
            titulo: "Fila do WhatsApp quase cheia",
            descricao: `Fila em ${pct}% (${total}/${filaMax}). Considere fazer upgrade.`,
            link: "/planos",
          });
        }
      }
    }

    // ---- Fila pausada (transição) ----
    if (lastPausadaRef.current === null) {
      try {
        lastPausadaRef.current = sessionStorage.getItem(KEY_PAUSADA) === "1";
      } catch {
        lastPausadaRef.current = false;
      }
    }
    if (filaPausada !== lastPausadaRef.current) {
      lastPausadaRef.current = filaPausada;
      try { sessionStorage.setItem(KEY_PAUSADA, filaPausada ? "1" : "0"); } catch { /* ignore */ }
      if (filaPausada) {
        notificar({
          tipo: "whatsapp",
          titulo: "Fila de envios pausada",
          descricao: "Nenhuma mensagem será enviada até você retomar a fila.",
          link: "/app/whatsapp",
        });
      } else {
        notificar({
          tipo: "whatsapp",
          titulo: "Fila de envios retomada",
          descricao: "Os envios voltaram a sair no intervalo configurado.",
          link: "/app/whatsapp",
        });
      }
    }

    // ---- Fila desativada (sem intervalo) ----
    const desativada = !filaAtiva;
    if (lastDesativadaRef.current === null) {
      try {
        lastDesativadaRef.current = sessionStorage.getItem(KEY_DESATIVADA) === "1";
      } catch {
        lastDesativadaRef.current = false;
      }
    }
    if (desativada !== lastDesativadaRef.current) {
      lastDesativadaRef.current = desativada;
      try { sessionStorage.setItem(KEY_DESATIVADA, desativada ? "1" : "0"); } catch { /* ignore */ }
      if (desativada) {
        notificar({
          tipo: "whatsapp",
          titulo: "Fila de espera desativada",
          descricao: "Mensagens sairão sem intervalo — alto risco de bloqueio no WhatsApp.",
          link: "/app/whatsapp",
        });
      }
    }
  }, [cfg, fila]);

  return null;
}
