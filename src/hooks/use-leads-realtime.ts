import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasSession } from "@/hooks/use-has-session";

/**
 * Assina mudanças em tempo real na tabela `leads` do usuário logado e
 * invalida a query `["leads"]` a cada evento — assim as colunas do CRM
 * reagem imediatamente quando o cron de envios ou a IA de vendas mudam o
 * status de um lead, sem depender de refresh manual.
 */
export function useLeadsRealtime() {
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
        .channel(`leads:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "leads",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["leads"] });
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
