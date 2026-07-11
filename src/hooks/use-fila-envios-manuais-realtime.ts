import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasSession } from "@/hooks/use-has-session";

/**
 * Assina mudanças em tempo real na fila de envios manuais do usuário logado
 * e invalida a query `["fila-envios-manuais"]` a cada evento.
 * Usa 1 canal por montagem — o `useEffect` faz cleanup para não vazar.
 */
export function useFilaEnviosManuaisRealtime() {
  const queryClient = useQueryClient();
  const hasSession = useHasSession();

  useEffect(() => {
    if (hasSession !== true) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;

      channel = supabase
        .channel(`envios_manuais_fila:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "envios_manuais_fila",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            queryClient.invalidateQueries({ queryKey: ["fila-envios-manuais"] });
            queryClient.invalidateQueries({ queryKey: ["envios-manuais-fila"] });
            queryClient.invalidateQueries({ queryKey: ["fila-paginada"] });
            queryClient.invalidateQueries({ queryKey: ["fila-item"] });
            queryClient.invalidateQueries({ queryKey: ["fila-historico-lead"] });
            // Quando um item da fila é marcado como 'enviado' pelo cron, o
            // lead correspondente também muda de status ('novo' → 'contatado').
            // Sem invalidar a query de leads, o CRM continua mostrando o lead
            // na coluna "Novo" até o próximo refetch manual.
            const novo = (payload as { new?: { status?: string } }).new;
            const antigo = (payload as { old?: { status?: string } }).old;
            if (novo?.status !== antigo?.status) {
              queryClient.invalidateQueries({ queryKey: ["leads"] });
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [hasSession, queryClient]);
}
