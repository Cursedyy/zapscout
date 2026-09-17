import { supabase } from "@/integrations/supabase/client";
import type { PlanoId } from "@/data/planos";

export type FunnelEventName =
  | "email_confirmed"
  | "plans_viewed"
  | "checkout_clicked"
  | "first_search";

export async function trackFunnelEvent(eventName: FunnelEventName, planId?: PlanoId) {
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return;

  const { error } = await supabase.rpc("track_funnel_event", {
    _event_name: eventName,
    _plan_id: planId ?? undefined,
    _source: "app",
  });
  if (error) console.warn("[funnel] evento não registrado", eventName);
}