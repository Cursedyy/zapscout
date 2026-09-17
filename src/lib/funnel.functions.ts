import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getFunnelSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ days: z.number().int().min(7).max(90).default(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isOwner, error: roleError } = await context.supabase.rpc("is_dono", {
      _user_id: context.userId,
    });
    if (roleError || !isOwner) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const [{ data: events, error: eventsError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabaseAdmin.from("funnel_events").select("user_id,event_name,plan_id,created_at").gte("created_at", since),
      supabaseAdmin.from("profiles").select("id,plano,kiwify_order_id,created_at").gte("created_at", since),
    ]);
    if (eventsError || profilesError) throw new Error("Não foi possível carregar o funil");

    const names = [
      "email_confirmed",
      "first_search",
      "first_lead",
      "whatsapp_connected",
      "first_message_sent",
      "plans_viewed",
      "checkout_clicked",
      "purchase_approved",
    ] as const;
    const counts = Object.fromEntries(names.map((name) => [name, new Set<string>()])) as Record<(typeof names)[number], Set<string>>;
    for (const event of events ?? []) {
      if (event.event_name in counts) counts[event.event_name as keyof typeof counts].add(event.user_id);
    }

    return {
      days: data.days,
      signups: profiles?.length ?? 0,
      paid: profiles?.filter((profile) => profile.plano !== "free" && profile.plano !== "dono").length ?? 0,
      orders: profiles?.filter((profile) => Boolean(profile.kiwify_order_id)).length ?? 0,
      steps: names.map((name) => ({ name, users: counts[name].size })),
    };
  });