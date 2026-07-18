/**
 * Cron: processa o buffer de debounce da IA de Vendas.
 * Chamado com frequência curta (~10s, registrado manualmente via pg_cron —
 * ver nota no README/migration) — bem mais frequente que os outros crons
 * (1 min) porque a janela de silêncio é de só 8s.
 *
 * Lógica: uazapi-webhook.ts NÃO chama mais a IA direto quando o lead manda
 * mensagem — só empilha em `ia_conversas.debounce_buffer` (via
 * bufferizarMensagemIA). Este cron:
 *   1. Busca conversas com buffer pendente (`debounce_primeira_em` setado)
 *      onde já passou 8s desde a última atividade OU 28s desde a primeira
 *      mensagem do lote (teto de segurança).
 *   2. Junta todos os textos do buffer numa única string consolidada.
 *   3. Chama processarMensagemAdmin() normalmente — reaproveita 100% do
 *      pipeline de IA já existente (bot-detection, trava de preço,
 *      classificador de negociação, etc.), sem nenhuma mudança lá.
 *   4. Limpa o buffer (sempre, mesmo se a chamada falhar — best-effort,
 *      evita acumular um buffer gigante em loop de retry infinito).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import { processarMensagemAdmin, type MensagemBufferizada } from "@/lib/ia.server";

const JANELA_SILENCIO_MS = 8_000;
const TETO_SEGURANCA_MS = 28_000;

type ConversaPendente = {
  id: string;
  user_id: string;
  lead_id: string;
  uazapi_instancia_id: string | null;
  debounce_buffer: MensagemBufferizada[];
};

async function limparBuffer(conversaId: string) {
  await supabaseAdmin
    .from("ia_conversas" as never)
    .update({
      debounce_buffer: [],
      debounce_primeira_em: null,
      debounce_ultima_atividade_em: null,
    } as never)
    .eq("id", conversaId);
}

export const Route = createFileRoute("/api/public/hooks/process-ia-debounce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-ia-debounce");
        if (gate) return gate;

        const results = { processadas: 0, erros: 0 };

        try {
          const agora = Date.now();
          const corteSilencio = new Date(agora - JANELA_SILENCIO_MS).toISOString();
          const corteTeto = new Date(agora - TETO_SEGURANCA_MS).toISOString();

          const { data: conversas } = await supabaseAdmin
            .from("ia_conversas" as never)
            .select("id, user_id, lead_id, uazapi_instancia_id, debounce_buffer")
            .not("debounce_primeira_em", "is", null)
            .or(`debounce_ultima_atividade_em.lte.${corteSilencio},debounce_primeira_em.lte.${corteTeto}`)
            .limit(100);

          for (const c of (conversas ?? []) as unknown as ConversaPendente[]) {
            const buffer = Array.isArray(c.debounce_buffer) ? c.debounce_buffer : [];
            if (buffer.length === 0) {
              // Não devia acontecer (primeira_em só é setado junto com o
              // buffer), mas limpa por segurança pra não ficar preso.
              await limparBuffer(c.id);
              continue;
            }

            const textoConsolidado = buffer.map((m) => m.texto).join("\n");
            console.log(
              "[process-ia-debounce] processando lote — conversa:",
              c.id,
              "lead:",
              c.lead_id,
              "mensagens no lote:",
              buffer.length,
            );

            try {
              await processarMensagemAdmin(
                c.user_id,
                c.lead_id,
                textoConsolidado,
                c.uazapi_instancia_id,
              );
              results.processadas++;
            } catch (err) {
              console.error("[process-ia-debounce] falha ao processar lote:", c.id, err);
              results.erros++;
            } finally {
              // Sempre limpa — best-effort, evita loop de retry acumulando
              // buffer indefinidamente se a IA estiver com problema.
              await limparBuffer(c.id);
            }
          }
        } catch (e) {
          console.error("[process-ia-debounce] falha inesperada no run:", e);
        }

        return Response.json({ ok: true, ts: new Date().toISOString(), ...results });
      },
    },
  },
});
