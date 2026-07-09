import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, Hourglass, ListChecks, TimerReset } from "lucide-react";

import { Card } from "@/components/ui/card";
import { useHasSession } from "@/hooks/use-has-session";
import { useFilaEnviosManuaisRealtime } from "@/hooks/use-fila-envios-manuais-realtime";
import { getWhatsAppConfig, listEnviosManuaisFila } from "@/lib/whatsapp.functions";

type Pendente = { agendado_para: string };

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
  const intervalo = !!cfg && "intervaloSegundos" in cfg ? cfg.intervaloSegundos ?? 60 : 60;
  const filaMax = !!cfg && "filaMax" in cfg ? cfg.filaMax ?? 0 : 0;
  const planoNome = !!cfg && "planoNome" in cfg ? cfg.planoNome ?? "" : "";
  const percentUso = filaMax > 0 ? Math.min(100, Math.round((total / filaMax) * 100)) : 0;
  const perto = filaMax > 0 && total / filaMax >= 0.8;
  const cheio = filaMax > 0 && total >= filaMax;

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
          <a href="/planos" className="underline">Fazer upgrade</a>.
        </p>
      )}
      {!cheio && perto && (
        <p className="text-[11px] text-warning">
          Fila quase cheia ({total}/{filaMax}). Considere aumentar o plano para não bloquear novos envios.
        </p>
      )}
      {!filaAtiva && (
        <p className="text-[11px] text-destructive">
          Fila de espera desativada — mensagens saem sem intervalo (risco de bloqueio no WhatsApp).
        </p>
      )}
    </Card>
  );
}
