import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Activity, Clock, Hourglass, ListChecks, Pause, Play, TimerReset, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasSession } from "@/hooks/use-has-session";
import { useFilaEnviosManuaisRealtime } from "@/hooks/use-fila-envios-manuais-realtime";
import {
  getWhatsAppConfig,
  listEnviosManuaisFila,
  cancelEnviosManuais,
  setFilaPausada,
} from "@/lib/whatsapp.functions";

type Pendente = {
  id: string;
  numero: string;
  texto: string;
  agendado_para: string;
  lead_nome?: string | null;
};

function formatarEspera(ms: number): string {
  if (ms <= 0) return "agora";
  const s = Math.round(ms / 1000);
  if (s < 60) return `em ~${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `em ~${m}min ${rs}s` : `em ~${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `em ~${h}h ${rm}min` : `em ~${h}h`;
}

function formatarHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function FilaStatusPanel() {
  const hasSession = useHasSession();
  useFilaEnviosManuaisRealtime();

  const listFn = useServerFn(listEnviosManuaisFila);
  const cfgFn = useServerFn(getWhatsAppConfig);
  const cancelFn = useServerFn(cancelEnviosManuais);
  const pauseFn = useServerFn(setFilaPausada);
  const qc = useQueryClient();

  const { data: fila } = useQuery({
    queryKey: ["fila-envios-manuais"],
    queryFn: () => listFn(),
    enabled: hasSession === true,
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const { data: cfg } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => cfgFn(),
    enabled: hasSession === true,
    staleTime: 20000,
  });

  const cancelMut = useMutation({
    mutationFn: (payload: { ids?: string[]; all?: boolean }) => cancelFn({ data: payload }),
    onSuccess: (res) => {
      toast.success(
        res.cancelados === 1
          ? "1 mensagem cancelada"
          : `${res.cancelados} mensagens canceladas`,
      );
      qc.invalidateQueries({ queryKey: ["fila-envios-manuais"] });
      qc.invalidateQueries({ queryKey: ["wa-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar"),
  });

  const pauseMut = useMutation({
    mutationFn: (pausada: boolean) => pauseFn({ data: { pausada } }),
    onSuccess: (res) => {
      toast.success(res.pausada ? "Fila pausada — envios suspensos" : "Fila retomada");
      qc.invalidateQueries({ queryKey: ["wa-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao alterar fila"),
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const pendentes = (fila?.pendentes ?? []) as unknown as Pendente[];
  const total = pendentes.length;

  const proximoTs = pendentes.length > 0 ? new Date(pendentes[0].agendado_para).getTime() : null;
  const ultimoTs =
    pendentes.length > 0
      ? new Date(pendentes[pendentes.length - 1].agendado_para).getTime()
      : null;

  const conectado = !!cfg && "connected" in cfg && cfg.connected;
  const filaAtiva = !!cfg && "filaAtiva" in cfg ? cfg.filaAtiva !== false : true;
  const filaPausada = !!cfg && "filaPausada" in cfg ? cfg.filaPausada === true : false;
  const intervalo = !!cfg && "intervaloSegundos" in cfg ? cfg.intervaloSegundos ?? 60 : 60;
  const filaMax = !!cfg && "filaMax" in cfg ? cfg.filaMax ?? 0 : 0;
  const planoNome = !!cfg && "planoNome" in cfg ? cfg.planoNome ?? "" : "";
  const percentUso = filaMax > 0 ? Math.min(100, Math.round((total / filaMax) * 100)) : 0;
  const perto = filaMax > 0 && total / filaMax >= 0.8;
  const cheio = filaMax > 0 && total >= filaMax;

  // Alertas de painel + navegador ao cruzar 80% / 100%
  const lastLevelRef = useRef<"ok" | "perto" | "cheio">("ok");
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );

  useEffect(() => {
    if (filaMax <= 0) return;
    const level: "ok" | "perto" | "cheio" = cheio ? "cheio" : perto ? "perto" : "ok";
    const prev = lastLevelRef.current;
    if (level === prev) return;
    lastLevelRef.current = level;

    if (level === "cheio" && prev !== "cheio") {
      const msg = `Fila cheia (${total}/${filaMax}) — novos envios serão recusados.`;
      toast.error(msg, { duration: 8000 });
      if (notifPerm === "granted") {
        try {
          new Notification("Fila do WhatsApp cheia", { body: msg, tag: "fila-cheio" });
        } catch { /* ignore */ }
      }
    } else if (level === "perto" && prev === "ok") {
      const msg = `Fila em ${percentUso}% (${total}/${filaMax}) — considere fazer upgrade.`;
      toast.warning(msg, { duration: 6000 });
      if (notifPerm === "granted") {
        try {
          new Notification("Fila do WhatsApp quase cheia", { body: msg, tag: "fila-perto" });
        } catch { /* ignore */ }
      }
    }
  }, [cheio, perto, total, filaMax, percentUso, notifPerm]);

  const pedirPermissao = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      if (p === "granted") toast.success("Notificações do navegador ativadas");
      else if (p === "denied") toast.error("Permissão negada — libere nas configurações do navegador");
    } catch {
      toast.error("Não foi possível ativar notificações");
    }
  };

  return (
    <Card className="p-4 bg-gradient-card border-border space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          Status da fila de envios
        </h3>
        <div className="flex items-center gap-2">
          {planoNome && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              Plano {planoNome}
            </span>
          )}
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              conectado
                ? "bg-success/15 text-success"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            {conectado ? "WhatsApp conectado" : "WhatsApp desconectado"}
          </span>
          {filaPausada && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              Fila pausada
            </span>
          )}
          <Button
            size="sm"
            variant={filaPausada ? "default" : "outline"}
            className="h-6 px-2 text-[10px]"
            disabled={pauseMut.isPending}
            onClick={() => pauseMut.mutate(!filaPausada)}
          >
            {filaPausada ? (
              <>
                <Play className="h-3 w-3 mr-1" /> Retomar fila
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 mr-1" /> Pausar fila
              </>
            )}
          </Button>
          {notifPerm === "default" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={pedirPermissao}
            >
              Ativar alertas
            </Button>
          )}
          {notifPerm === "denied" && (
            <span className="text-[10px] text-muted-foreground">
              alertas bloqueados no navegador
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ListChecks className="h-3 w-3" /> Na fila
          </div>
          <div className="text-2xl font-semibold text-foreground mt-1">
            {total}
            {filaMax > 0 && (
              <span className="text-sm text-muted-foreground font-normal"> / {filaMax}</span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">mensagens pendentes</div>
          {filaMax > 0 && (
            <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${
                  cheio ? "bg-destructive" : perto ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${percentUso}%` }}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Próximo envio
          </div>
          <div className="text-lg font-semibold text-foreground mt-1">
            {proximoTs ? formatarEspera(proximoTs - now) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {proximoTs ? `janela às ${formatarHora(new Date(proximoTs).toISOString())}` : "fila vazia"}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Hourglass className="h-3 w-3" /> Última janela
          </div>
          <div className="text-lg font-semibold text-foreground mt-1">
            {ultimoTs ? formatarHora(new Date(ultimoTs).toISOString()) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {ultimoTs ? formatarEspera(ultimoTs - now) : "sem previsão"}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <TimerReset className="h-3 w-3" /> Intervalo
          </div>
          <div className="text-lg font-semibold text-foreground mt-1">
            {filaAtiva ? `${intervalo}s` : "sem espera"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {filaAtiva ? "entre envios" : "fila desativada"}
          </div>
        </div>
      </div>

      {cheio && (
        <p className="text-[11px] text-destructive">
          Limite da fila atingido no plano {planoNome} ({filaMax} mensagens).
          Novos envios serão recusados até liberar espaço.{" "}
          <Link to="/planos" className="underline font-medium">
            Fazer upgrade
          </Link>.
        </p>
      )}
      {!cheio && perto && (
        <p className="text-[11px] text-warning">
          Fila quase cheia ({total}/{filaMax}). Considere aumentar o plano para não bloquear novos envios.{" "}
          <Link to="/planos" className="underline font-medium">
            Fazer upgrade
          </Link>.
        </p>
      )}

      {!filaAtiva && (
        <p className="text-[11px] text-destructive">
          Fila de espera desativada — mensagens saem sem intervalo (risco de bloqueio no WhatsApp).
        </p>
      )}

      {total > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">
              Mensagens pendentes ({total})
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
              disabled={cancelMut.isPending}
              onClick={() => {
                if (confirm(`Cancelar todas as ${total} mensagens pendentes?`)) {
                  cancelMut.mutate({ all: true });
                }
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Cancelar tudo
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {pendentes.slice(0, 50).map((p) => {
              const ts = new Date(p.agendado_para).getTime();
              return (
                <div
                  key={p.id}
                  className="flex items-start gap-2 p-2 rounded-md bg-muted/30 border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground truncate">
                        {p.lead_nome || p.numero}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatarHora(p.agendado_para)} · {formatarEspera(ts - now)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {p.texto}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={cancelMut.isPending}
                    aria-label="Cancelar mensagem"
                    onClick={() => cancelMut.mutate({ ids: [p.id] })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            {pendentes.length > 50 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                Mostrando 50 de {pendentes.length}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
