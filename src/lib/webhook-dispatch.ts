import { supabase } from "@/integrations/supabase/client";

export type WebhookEvento =
  "lead_adicionado" | "lead_status_alterado" | "campanha_concluida" | "followup_enviado";

export async function dispararWebhooks(evento: WebhookEvento, payload: Record<string, unknown>) {
  return dispararWebhooksBatch(evento, [payload]);
}

/**
 * Versão em lote: busca sessão + webhook_configs UMA vez e dispara 1 POST
 * por payload (preserva 1 notificação por lead pro integrador externo),
 * em vez de repetir as 2 queries do Supabase a cada item.
 */
export async function dispararWebhooksBatch(
  evento: WebhookEvento,
  payloads: Record<string, unknown>[],
) {
  if (payloads.length === 0) return;
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;
    if (!userId) return;

    const { data: configs } = await supabase
      .from("webhook_configs")
      .select("url, secret, eventos")
      .eq("user_id", userId)
      .eq("ativo", true);

    if (!configs || configs.length === 0) return;

    const configsAtivos = configs.filter(
      (cfg) => Array.isArray(cfg.eventos) && cfg.eventos.includes(evento),
    );
    if (configsAtivos.length === 0) return;

    for (const payload of payloads) {
      const body = JSON.stringify({
        evento,
        timestamp: new Date().toISOString(),
        data: payload,
      });
      for (const cfg of configsAtivos) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (cfg.secret) headers["X-ZapScout-Secret"] = cfg.secret;
        // fire-and-forget — não bloqueia a UI nem propaga erros
        fetch(cfg.url, { method: "POST", headers, body, mode: "no-cors" }).catch(() => {});
      }
    }
  } catch {
    // silencia — webhook nunca deve quebrar o fluxo principal
  }
}
