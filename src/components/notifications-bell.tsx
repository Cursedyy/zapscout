import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
  type Notificacao,
} from "@/lib/notificacoes.functions";
import { cn } from "@/lib/utils";

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

export function NotificationsBell({ className }: { className?: string }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const listFn = useServerFn(listarNotificacoes);
  const markFn = useServerFn(marcarNotificacaoLida);
  const markAllFn = useServerFn(marcarTodasNotificacoesLidas);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
  }, []);

  const { data: notifs = [] } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: () => listFn(),
    enabled: !!userId,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);

  const naoLidas = (notifs as Notificacao[]).filter((n) => !n.lida).length;

  const marcarLida = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
  });
  const marcarTodas = useMutation({
    mutationFn: () => markAllFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Notificações${naoLidas > 0 ? ` (${naoLidas} novas)` : ""}`}
          className={cn("relative", className)}
        >
          <Bell className="h-5 w-5" />
          {naoLidas > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground grid place-items-center">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Notificações</div>
          {naoLidas > 0 && (
            <button
              onClick={() => marcarTodas.mutate()}
              className="text-xs text-primary hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {notifs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Sem notificações por enquanto
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(notifs as Notificacao[]).map((n) => {
                const body = (
                  <div className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 rounded-full shrink-0",
                        n.lida ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{n.titulo}</div>
                      {n.descricao && (
                        <div className="text-xs text-muted-foreground line-clamp-2">{n.descricao}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">há {timeAgo(n.created_at)}</div>
                    </div>
                    {!n.lida && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          marcarLida.mutate(n.id);
                        }}
                        className="text-muted-foreground hover:text-primary self-start"
                        aria-label="Marcar como lida"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "px-4 py-3 hover:bg-secondary/40 transition-colors",
                      !n.lida && "bg-primary/5",
                    )}
                  >
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => !n.lida && marcarLida.mutate(n.id)}
                        className="block"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
