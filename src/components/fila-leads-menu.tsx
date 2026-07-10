import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock, ChevronDown, ChevronUp, Loader2, ExternalLink, GripVertical, X } from "lucide-react";
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

const POS_KEY = "zs:fila-popup-pos";
const CLOSED_KEY = "zs:fila-popup-closed";

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

  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === "number" && typeof p?.y === "number") setPos(p);
      } else {
        setPos({ x: window.innerWidth - 340, y: 96 });
      }
      setClosed(localStorage.getItem(CLOSED_KEY) === "1");
    } catch {
      setPos({ x: 24, y: 96 });
    }
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      const w = popupRef.current?.offsetWidth ?? 320;
      const h = popupRef.current?.offsetHeight ?? 60;
      const nx = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - dragRef.current.dx));
      const ny = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - dragRef.current.dy));
      setPos({ x: nx, y: ny });
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {}
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pos]);

  const pendentes = (data?.pendentes ?? []) as Item[];
  const total = pendentes.length;

  if (closed) return null;
  if (!isLoading && total === 0) return null;
  if (!pos) return null;

  const startDrag = (e: React.PointerEvent) => {
    const rect = popupRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };

  const closePopup = () => {
    setClosed(true);
    try {
      localStorage.setItem(CLOSED_KEY, "1");
    } catch {}
  };

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-[300px] rounded-xl border border-primary/30 bg-background/95 backdrop-blur shadow-lg overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={startDrag}
        className="flex items-center gap-2 px-2.5 py-2 bg-primary/10 cursor-grab active:cursor-grabbing select-none"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Fila de envio</span>
        <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] tabular-nums">
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : total}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground p-0.5"
          aria-label={open ? "Recolher" : "Expandir"}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={closePopup}
          className="text-muted-foreground hover:text-foreground p-0.5"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <>
          <div className="border-t border-primary/20 px-2.5 py-1.5 flex justify-end">
            <Link
              to="/app/fila"
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            >
              Ver fila completa <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
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
        </>
      )}
    </div>
  );
}
