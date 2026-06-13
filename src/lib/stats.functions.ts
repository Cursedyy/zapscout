import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * KPIs do painel — agregados diretos do Supabase respeitando RLS do usuário.
 */
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    try {
      const [leadsRes, msgsRes, respRes, fechadosRes, respondidosRes, campanhasRes] =
        await Promise.all([
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("user_id", userId),
          supabase
            .from("mensagens_enviadas")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("mensagens_enviadas")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("respondeu", true),
          supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("status", "fechado"),
          supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userId)
            .in("status", ["respondeu", "negociacao", "fechado"]),
          supabase.from("campanhas").select("status").eq("user_id", userId),
        ]);

      const firstError = [
        leadsRes,
        msgsRes,
        respRes,
        fechadosRes,
        respondidosRes,
        campanhasRes,
      ].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const leadsTotal = leadsRes.count ?? 0;
      const mensagensEnviadas = msgsRes.count ?? 0;
      const respostas = respRes.count ?? 0;
      const fechados = fechadosRes.count ?? 0;
      const leadsRespondidos = respondidosRes.count ?? 0;

      // Taxa de resposta: % de mensagens enviadas que receberam resposta.
      // Fallback: se não houve mensagens, calcula em cima dos leads no CRM.
      const taxaResposta =
        mensagensEnviadas > 0
          ? Math.round((respostas / mensagensEnviadas) * 100)
          : leadsTotal > 0
            ? Math.round((leadsRespondidos / leadsTotal) * 100)
            : 0;

      const campanhas = campanhasRes.data ?? [];
      const campanhasAtivas = campanhas.filter(
        (c) => c.status === "em_andamento" || c.status === "agendada",
      ).length;

      return {
        leadsTotal,
        leadsRespondidos,
        fechados,
        mensagensEnviadas,
        respostas,
        taxaResposta,
        campanhasTotal: campanhas.length,
        campanhasAtivas,
        error: null as string | null,
      };
    } catch (error) {
      console.error("[stats] falha ao carregar KPIs", error);
      return {
        leadsTotal: 0,
        leadsRespondidos: 0,
        fechados: 0,
        mensagensEnviadas: 0,
        respostas: 0,
        taxaResposta: 0,
        campanhasTotal: 0,
        campanhasAtivas: 0,
        error: "Não foi possível carregar as estatísticas agora.",
      };
    }
  });
