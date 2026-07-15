import { useEffect, useMemo, useState } from "react";
import { Bell, Check, CheckCheck, ExternalLink, Trash2, Filter, MailOpen, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const TIPO_EMOJI: Record<string, string> = {
  lead: "🎯",
  campanha: "📣",
  aquecimento: "🔥",
  followup: "⏰",
  whatsapp: "💬",
  ia: "🤖",
  sistema: "ℹ️",
};

const TIPO_LABEL: Record<string, string> = {
  lead: "Leads",
  campanha: "Campanhas",
  aquecimento: "Aquecimento",
  followup: "Follow-ups",
  whatsapp: "WhatsApp",
  ia: "IA",
  sistema: "Sistema",
};

type FiltroTipo = "todos" | "nao_lidas" | string;

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");
  const [confirmarLimpar, setConfirmarLimpar] = useState<null | "lidas" | "todas">(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const carregar = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id,tipo,titulo,descricao,link,lida,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setItems((data as Notificacao[]) ?? []);
    } catch (error) {
      console.error("[notifications] falha ao carregar", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = useMemo(() => items.filter((n) => !n.lida).length, [items]);

  const tiposPresentes = useMemo(() => {
    const s = new Set<string>();
    items.forEach((n) => s.add(n.tipo));
    return Array.from(s);
  }, [items]);

  const itemsFiltrados = useMemo(() => {
    if (filtro === "todos") return items;
    if (filtro === "nao_lidas") return items.filter((n) => !n.lida);
    return items.filter((n) => n.tipo === filtro);
  }, [items, filtro]);

  const marcarLida = async (id: string) => {
    if (!userId) return;
    const prev = items;
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      setItems(prev);
      toast.error("Não foi possível marcar como lida");
    }
  };

  const marcarNaoLida = async (id: string) => {
    if (!userId) return;
    const prev = items;
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, lida: false } : n)));
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: false })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      setItems(prev);
      toast.error("Não foi possível marcar como não lida");
    }
  };

  const marcarTodas = async () => {
    if (!userId || unread === 0) return;
    const prev = items;
    setItems((cur) => cur.map((n) => ({ ...n, lida: true })));
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("user_id", userId)
      .eq("lida", false);
    if (error) {
      setItems(prev);
      toast.error("Não foi possível marcar todas");
    } else {
      toast.success("Todas marcadas como lidas");
    }
  };

  const deletar = async (id: string) => {
    if (!userId) return;
    const prev = items;
    setItems((cur) => cur.filter((n) => n.id !== id));
    const { error } = await supabase
      .from("notificacoes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      setItems(prev);
      toast.error("Não foi possível excluir");
    } else {
      toast.success("Notificação excluída");
    }
  };

  const limparLidas = async () => {
    if (!userId) return;
    const prev = items;
    setItems((cur) => cur.filter((n) => !n.lida));
    const { error } = await supabase
      .from("notificacoes")
      .delete()
      .eq("user_id", userId)
      .eq("lida", true);
    if (error) {
      setItems(prev);
      toast.error("Não foi possível limpar");
    } else {
      toast.success("Notificações lidas removidas");
    }
  };

  const limparTodas = async () => {
    if (!userId) return;
    const prev = items;
    setItems([]);
    const { error } = await supabase
      .from("notificacoes")
      .delete()
      .eq("user_id", userId);
    if (error) {
      setItems(prev);
      toast.error("Não foi possível limpar");
    } else {
      toast.success("Todas as notificações removidas");
    }
  };

  if (!userId) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ""}`}
            className={cn(
              "relative grid place-items-center h-9 w-9 rounded-md hover:bg-secondary/50 transition-colors",
              className,
            )}
          >
            <Bell className="h-[18px] w-[18px] text-sidebar-foreground/80" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center px-1 tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-sm">Notificações</div>
              {unread > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary tabular-nums">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <Filter className="h-3 w-3" />
                    {filtro === "todos"
                      ? "Todas"
                      : filtro === "nao_lidas"
                        ? "Não lidas"
                        : TIPO_LABEL[filtro] ?? filtro}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs">Filtrar por</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setFiltro("todos")}>Todas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFiltro("nao_lidas")}>
                    Não lidas
                  </DropdownMenuItem>
                  {tiposPresentes.length > 0 && <DropdownMenuSeparator />}
                  {tiposPresentes.map((t) => (
                    <DropdownMenuItem key={t} onClick={() => setFiltro(t)}>
                      <span className="mr-1">{TIPO_EMOJI[t] ?? "•"}</span>
                      {TIPO_LABEL[t] ?? t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações">
                    <span className="text-lg leading-none">⋯</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={marcarTodas} disabled={unread === 0}>
                    <CheckCheck className="h-4 w-4" /> Marcar todas como lidas
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmarLimpar("lidas")}
                    disabled={items.every((n) => !n.lida)}
                  >
                    <Trash2 className="h-4 w-4" /> Limpar lidas
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setConfirmarLimpar("todas")}
                    disabled={items.length === 0}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir todas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <ScrollArea className="max-h-[440px]">
            {loading && items.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
            ) : itemsFiltrados.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Bell className="h-7 w-7 mx-auto mb-2 opacity-40" />
                {items.length === 0
                  ? "Nenhuma notificação por aqui"
                  : "Nada neste filtro"}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {itemsFiltrados.map((n) => {
                  const emoji = TIPO_EMOJI[n.tipo] ?? "•";
                  const openLink = () => {
                    if (!n.lida) marcarLida(n.id);
                    setOpen(false);
                    if (n.link && n.link.startsWith("/")) {
                      navigate({ to: n.link as never });
                    } else if (n.link) {
                      window.open(n.link, "_blank", "noopener,noreferrer");
                    }
                  };
                  return (
                    <li key={n.id} className="group relative">
                      <div
                        className={cn(
                          "flex gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors",
                          !n.lida && "bg-primary/5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={openLink}
                          className="flex gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="shrink-0 text-base leading-none mt-0.5">{emoji}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <div
                                className={cn(
                                  "text-sm truncate",
                                  !n.lida ? "font-semibold" : "font-medium",
                                )}
                              >
                                {n.titulo}
                              </div>
                              {!n.lida && (
                                <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                              )}
                            </div>
                            {n.descricao && (
                              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {n.descricao}
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                              <span>há {timeAgo(n.created_at)}</span>
                              {n.link && (
                                <span className="inline-flex items-center gap-0.5">
                                  <ExternalLink className="h-2.5 w-2.5" /> abrir
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        <div className="shrink-0 flex items-start">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-60 hover:opacity-100"
                                aria-label="Ações da notificação"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-base leading-none">⋯</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {n.lida ? (
                                <DropdownMenuItem onClick={() => marcarNaoLida(n.id)}>
                                  <MailOpen className="h-4 w-4" /> Marcar como não lida
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => marcarLida(n.id)}>
                                  <Check className="h-4 w-4" /> Marcar como lida
                                </DropdownMenuItem>
                              )}
                              {n.link && (
                                <DropdownMenuItem onClick={openLink}>
                                  <ExternalLink className="h-4 w-4" /> Abrir link
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => deletar(n.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          {items.length > 0 && (
            <div className="px-4 py-2 border-t border-border flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {itemsFiltrados.length} de {items.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  carregar();
                }}
              >
                Atualizar
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={confirmarLimpar !== null}
        onOpenChange={(v) => !v && setConfirmarLimpar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmarLimpar === "todas"
                ? "Excluir todas as notificações?"
                : "Limpar notificações lidas?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmarLimpar === "todas"
                ? "Isso removerá permanentemente todas as suas notificações, inclusive as não lidas."
                : "Isso removerá permanentemente as notificações já marcadas como lidas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <X className="h-4 w-4" /> Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmarLimpar === "todas") await limparTodas();
                else if (confirmarLimpar === "lidas") await limparLidas();
                setConfirmarLimpar(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4" /> Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
