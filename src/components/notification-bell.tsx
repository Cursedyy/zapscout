import { useEffect, useMemo, useState } from "react";
import { Bell, Check, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);

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
    const { data } = await supabase
      .from("notificacoes")
      .select("id,tipo,titulo,descricao,link,lida,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as Notificacao[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        () => carregar(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = useMemo(() => items.filter((n) => !n.lida).length, [items]);

  const marcarLida = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
  };

  const marcarTodas = async () => {
    if (!userId || unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, lida: true })));
    await supabase.from("notificacoes").update({ lida: true }).eq("user_id", userId).eq("lida", false);
  };

  if (!userId) return null;

  return (
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
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Notificações</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={marcarTodas}>
              <Check className="h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {loading && items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="h-7 w-7 mx-auto mb-2 opacity-40" />
              Nenhuma notificação por aqui
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const emoji = TIPO_EMOJI[n.tipo] ?? "•";
                const content = (
                  <div
                    className={cn(
                      "flex gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer",
                      !n.lida && "bg-primary/5",
                    )}
                  >
                    <div className="shrink-0 text-base leading-none mt-0.5">{emoji}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className={cn("text-sm truncate", !n.lida ? "font-semibold" : "font-medium")}>
                          {n.titulo}
                        </div>
                        {!n.lida && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      {n.descricao && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.descricao}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">há {timeAgo(n.created_at)}</div>
                    </div>
                    {n.link && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />}
                  </div>
                );
                const onClick = () => {
                  if (!n.lida) marcarLida(n.id);
                  setOpen(false);
                };
                if (n.link && n.link.startsWith("/")) {
                  return (
                    <li key={n.id}>
                      <Link to={n.link} onClick={onClick} className="block">
                        {content}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={n.id} onClick={onClick}>
                    {content}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
