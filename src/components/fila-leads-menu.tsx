import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  ExternalLink,
  GripVertical,
  X,
  Search,
  Trash2,
  Pause,
  Play,
} from "lucide-react";
import {
  cancelEnviosManuais,
  getWhatsAppConfig,
  listEnviosManuaisFila,
  setFilaPausada,
} from "@/lib/whatsapp.functions";
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
const FILTER_KEY = "zs:fila-popup-filter";
const SELECTION_KEY = "zs:fila-popup-selection";
const OPEN_KEY = "zs:fila-popup-open";

export function FilaLeadsMenu() {
  const hasSession = useHasSession();
  useFilaEnviosManuaisRealtime();
  const qc = useQueryClient();
  const fn = useServerFn(listEnviosManuaisFila);
  const cancelFn = useServerFn(cancelEnviosManuais);
  const configFn = useServerFn(getWhatsAppConfig);
  const pauseFn = useServerFn(setFilaPausada);
  const { data, isLoading } = useQuery({
    queryKey: ["fila-envios-manuais"],
    queryFn: () => fn(),
    enabled: hasSession === true,
    refetchInterval: 15000,
    staleTime: 10000,
  });
  const { data: config } = useQuery({
    queryKey: ["whatsapp-config"],
    queryFn: () => configFn(),
    enabled: hasSession === true,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const filaPausada = !!(config as { filaPausada?: boolean } | undefined)?.filaPausada;

  const pauseMut = useMutation({
    mutationFn: (pausada: boolean) => pauseFn({ data: { pausada } }),
    onSuccess: (res) => {
      toast.success(res?.pausada ? "Fila pausada" : "Fila retomada");
      qc.invalidateQueries({ queryKey: ["whatsapp-config"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao alterar fila"),
  });

  const [open, setOpen] = useState(true);
  const [closed, setClosed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // hydrate persisted state after mount (SSR-safe)
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
      const savedOpen = localStorage.getItem(OPEN_KEY);
      if (savedOpen !== null) setOpen(savedOpen === "1");
      setFilter(localStorage.getItem(FILTER_KEY) ?? "");
      const rawSel = localStorage.getItem(SELECTION_KEY);
      if (rawSel) {
        const parsed = JSON.parse(rawSel);
        if (parsed && typeof parsed === "object") setSelected(parsed);
      }
    } catch {
      setPos({ x: 24, y: 96 });
    }
    setHydrated(true);
  }, []);

  // persist filter
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(FILTER_KEY, filter);
    } catch {}
  }, [filter, hydrated]);

  // persist selection
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selected));
    } catch {}
  }, [selected, hydrated]);

  // persist open/collapse
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {}
  }, [open, hydrated]);

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

  // clean up selection entries whose ids are no longer in the queue
  useEffect(() => {
    if (!hydrated || !data) return;
    const ids = new Set(pendentes.map((p) => p.id));
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (ids.has(k) && v) next[k] = true;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [data, hydrated, pendentes]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pendentes;
    return pendentes.filter((p) => {
      const nome = (p.lead_nome ?? "").toLowerCase();
      const num = p.numero.replace(/\D/g, "");
      return nome.includes(q) || num.includes(q.replace(/\D/g, ""));
    });
  }, [pendentes, filter]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  );
  const selectedCount = selectedIds.length;

  const cancelMut = useMutation({
    mutationFn: (ids: string[]) => cancelFn({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`${res?.cancelados ?? 0} envio(s) cancelado(s)`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["fila-envios-manuais"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar"),
  });

  const total = pendentes.length;

  // Clamp active index to visible range (max 20 shown)
  const visibleItems = filtered.slice(0, 20);
  useEffect(() => {
    if (activeIndex >= visibleItems.length) {
      setActiveIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [visibleItems.length, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    const it = visibleItems[activeIndex];
    if (!it) return;
    const el = itemRefs.current.get(it.id);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, visibleItems]);

  // Keyboard shortcuts
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    }
    function onKey(e: KeyboardEvent) {
      // Toggle popup: Alt+Q — works anywhere, even while typing
      if (e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        if (closed) {
          setClosed(false);
          try {
            localStorage.setItem(CLOSED_KEY, "0");
          } catch {}
          setOpen(true);
        } else {
          setOpen((v) => !v);
        }
        return;
      }
      if (closed || !open) return;
      if (isTypingTarget(e.target)) return;

      const items = visibleItems;
      if (e.key === "ArrowDown") {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        if (items.length === 0) return;
        e.preventDefault();
        setActiveIndex(items.length - 1);
      } else if (e.key === " ") {
        const it = items[activeIndex];
        if (!it) return;
        e.preventDefault();
        setSelected((prev) => {
          const next = { ...prev };
          if (next[it.id]) delete next[it.id];
          else next[it.id] = true;
          return next;
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closed, visibleItems, activeIndex]);


  if (closed) return null;
  if (!isLoading && total === 0 && !filaPausada) return null;
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

  const toggleAllVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const it of filtered) {
        if (checked) next[it.id] = true;
        else delete next[it.id];
      }
      return next;
    });
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((it) => selected[it.id]);

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-[320px] rounded-xl border border-primary/30 bg-background/95 backdrop-blur shadow-lg overflow-hidden"
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
        {selectedCount > 0 && (
          <span className="rounded-full bg-destructive/20 text-destructive px-1.5 py-0.5 text-[10px] tabular-nums">
            {selectedCount} sel.
          </span>
        )}
        {filaPausada && (
          <span className="rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
            pausada
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          disabled={pauseMut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            pauseMut.mutate(!filaPausada);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`p-0.5 disabled:opacity-50 ${
            filaPausada
              ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              : "text-amber-600 hover:text-amber-700 dark:text-amber-400"
          }`}
          aria-label={filaPausada ? "Retomar fila" : "Pausar fila"}
          title={filaPausada ? "Retomar envios" : "Pausar envios"}
        >
          {pauseMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : filaPausada ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </button>
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
          <div className="border-t border-primary/20 px-2.5 py-1.5 flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por nome ou número"
                className="w-full h-7 pl-6 pr-6 text-[11px] rounded-md border border-primary/20 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar filtro"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Link
              to="/app/fila"
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Ver <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-primary/20 px-2.5 py-1.5 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  className="h-3 w-3 accent-primary"
                />
                Selecionar visíveis
              </label>
              <div className="flex-1" />
              {selectedCount > 0 && (
                <button
                  type="button"
                  disabled={cancelMut.isPending}
                  onClick={() => {
                    if (confirm(`Cancelar ${selectedCount} envio(s) pendente(s)?`)) {
                      cancelMut.mutate(selectedIds);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-50"
                >
                  {cancelMut.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Cancelar
                </button>
              )}
            </div>
          )}

          <div className="border-t border-primary/20 max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                {filter ? "Nenhum item corresponde ao filtro." : "Fila vazia."}
              </div>
            ) : (
              <ul className="divide-y divide-primary/10">
                {visibleItems.map((it, idx) => {
                  const isSel = !!selected[it.id];
                  const isActive = idx === activeIndex;
                  return (
                    <li
                      key={it.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(it.id, el);
                        else itemRefs.current.delete(it.id);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs ${isSel ? "bg-primary/5" : ""} ${isActive ? "ring-1 ring-inset ring-primary/50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = { ...prev };
                            if (e.target.checked) next[it.id] = true;
                            else delete next[it.id];
                            return next;
                          })
                        }
                        className="h-3 w-3 accent-primary shrink-0"
                      />
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
                  );
                })}
                {filtered.length > 20 && (
                  <li className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    + {filtered.length - 20} outros
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
