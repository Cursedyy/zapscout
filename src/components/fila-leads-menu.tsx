import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock, ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import { listEnviosManuaisFila } from "@/lib/whatsapp.functions";
import { useHasSession } from "@/hooks/use-has-session";
import { useFilaEnviosManuaisRealtime } from "@/hooks/use-fila-envios-manuais-realtime";

type Item = {
  id: string;
  numero: string;
  agendado_para?: string | null;
  lead_nome?: string | null;
};

function mask(numero: string) {
  const d = numero.replace(/\D/g, "");
  if (d.length < 4) return numero;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

function fmtEspera(iso?: string | null) {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "agora";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `em ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `em ${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `em ${h}h${rm}m` : `em ${h}h`;
}

function fmtHora(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function FilaLeadsMenu() {
  const hasSession = useHasSession();
  useFilaEnviosManuaisRealtime();
  const fn = useServerFn(listEnviosManuaisFila);
  const { data, isLoading } = useQuery({
    queryKey: ["fila-envios-manuais"],
    queryFn: () => fn(),
    enabled: hasSession === true,
    refetchInterval: 15000,
    staleTime: 10000,
  });
  const [open, setOpen] = useState(false);

  const pendentes = (data?.pendentes ?? []) as Item[];
  const total = pendentes.length;

  if (!isLoading && total === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-primary/10 transition-colors"
        aria-expanded={open}
      >
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span className="text-foreground">Leads na fila de envio</span>
        <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] tabular-nums">
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : total}
        </span>
        <div className="flex-1" />
        <Link
          to="/app/fila"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
        >
          Ver fila completa <ExternalLink className="h-3 w-3" />
        </Link>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-primary/20 max-h-64 overflow-y-auto">
          {pendentes.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Fila vazia.</div>
          ) : (
            <ul className="divide-y divide-primary/10">
              {pendentes.slice(0, 20).map((it) => (
                <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {it.lead_nome ?? mask(it.numero)}
                    </div>
                    {it.lead_nome && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {mask(it.numero)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-foreground">{fmtEspera(it.agendado_para)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtHora(it.agendado_para)}
                    </div>
                  </div>
                </li>
              ))}
              {pendentes.length > 20 && (
                <li className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                  + {pendentes.length - 20} outros na fila
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
