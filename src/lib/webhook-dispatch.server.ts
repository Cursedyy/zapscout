/**
 * Dispatcher de webhooks no servidor (crons + webhook UazAPI).
 * Espelha o comportamento de src/lib/webhook-dispatch.ts, mas usando
 * supabaseAdmin (bypassa RLS) porque roda sem sessão de usuário.
 * Fire-and-forget: nunca propaga erro para o caller.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WebhookEvento =
  | "lead_adicionado"
  | "lead_status_alterado"
  | "campanha_concluida"
  | "followup_enviado";

export async function dispararWebhooksServer(
  userId: string,
  evento: WebhookEvento,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: configs } = await supabaseAdmin
      .from("webhook_configs")
      .select("url, secret, eventos")
      .eq("user_id", userId)
      .eq("ativo", true);

    if (!configs || configs.length === 0) return;

    const body = JSON.stringify({
      evento,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    await Promise.all(
      configs
        .filter((c) => Array.isArray(c.eventos) && c.eventos.includes(evento))
        .map(async (cfg) => {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (cfg.secret) headers["X-ZapScout-Secret"] = cfg.secret;
          try {
            await fetch(cfg.url, { method: "POST", headers, body });
          } catch (err) {
            console.warn("[webhook-server] falha entrega:", cfg.url, err);
          }
        }),
    );
  } catch (err) {
    console.warn("[webhook-server] erro:", err);
  }
}
