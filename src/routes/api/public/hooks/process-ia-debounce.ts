/**
 * Cron: processa o buffer de debounce da IA de Vendas.
 * Chamado com frequência curta (~5s, registrado manualmente via pg_cron —
 * ver nota no README/migration) — bem mais frequente que os outros crons
 * (1 min) porque a janela de silêncio é de só 5s.
 *
 * Lógica: uazapi-webhook.ts NÃO chama mais a IA direto quando o lead manda
 * mensagem — só empilha em `ia_conversas.debounce_buffer` (via
 * bufferizarMensagemIA). Este cron:
 *   1. RESERVA atomicamente as conversas elegíveis (UPDATE...WHERE
 *      debounce_processando_desde IS NULL...RETURNING) — com o cron rodando
 *      a cada 5s e o processamento (Claude + envio WhatsApp) podendo levar
 *      mais que isso, um SELECT sem trava permitia duas execuções
 *      concorrentes pegarem o MESMO lote antes da primeira limpar o buffer,
 *      reprocessando a mesma mensagem (e a segunda passada classificava
 *      errado como "bot em loop", já que a primeira já tinha gravado a
 *      mensagem no histórico). O UPDATE...RETURNING é uma única instrução
 *      SQL — atômico no Postgres, a segunda execução concorrente nunca
 *      enxerga a mesma linha como livre.
 *   2. Junta os textos do lote reservado numa única string consolidada.
 *   3. Chama processarMensagemAdmin() normalmente — reaproveita 100% do
 *      pipeline de IA já existente, sem nenhuma mudança lá.
 *   4. Libera o lote: remove só as mensagens que essa execução processou
 *      (por `ts`) — se uma mensagem nova chegou via webhook enquanto
 *      processava, ela continua no buffer pro próximo tick, não se perde.
 *      Lock stale (execução anterior travou/crashou) é reassumível depois
 *      de LOCK_STALE_MS.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import { processarMensagemAdmin, type MensagemBufferizada } from "@/lib/ia.server";

const JANELA_SILENCIO_MS = 5_000;
const TETO_SEGURANCA_MS = 20_000;
const LOCK_STALE_MS = 60_000;

type ConversaReservada = {
  id: string;
  user_id: string;
  lead_id: string;
  uazapi_instancia_id: string | null;
  debounce_buffer: MensagemBufferizada[];
};

/**
 * Libera o lote após processar: remove só as mensagens processadas (por
 * `ts`), preserva qualquer mensagem nova que tenha chegado durante o
 * processamento, e sempre libera o lock (`debounce_processando_desde`).
 */
async function liberarLote(conversaId: string, tsProcessados: Set<number>) {
  const { data: atual } = await supabaseAdmin
    .from("ia_conversas" as never)
    .select("debounce_buffer")
    .eq("id", conversaId)
    .maybeSingle();
  const row = atual as unknown as { debounce_buffer: MensagemBufferizada[] } | null;
  const bufferAtual = Array.isArray(row?.debounce_buffer) ? row!.debounce_buffer : [];
  const restante = bufferAtual.filter((m) => !tsProcessados.has(m.ts));
  const tsRestantes = restante.map((m) => m.ts);

  await supabaseAdmin
    .from("ia_conversas" as never)
    .update({
      debounce_buffer: restante,
      debounce_primeira_em: tsRestantes.length
        ? new Date(Math.min(...tsRestantes)).toISOString()
        : null,
      debounce_ultima_atividade_em: tsRestantes.length
        ? new Date(Math.max(...tsRestantes)).toISOString()
        : null,
      debounce_processando_desde: null,
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
          const corteLockPreso = new Date(agora - LOCK_STALE_MS).toISOString();

          // Reserva atômica: UPDATE...RETURNING é uma única instrução SQL —
          // duas execuções concorrentes do cron nunca reservam a mesma linha.
          const { data: reservadas, error: reservaError } = await supabaseAdmin
            .from("ia_conversas" as never)
            .update({ debounce_processando_desde: new Date(agora).toISOString() } as never)
            .not("debounce_primeira_em", "is", null)
            .or(
              `debounce_ultima_atividade_em.lte.${corteSilencio},debounce_primeira_em.lte.${corteTeto}`,
            )
            .or(
              `debounce_processando_desde.is.null,debounce_processando_desde.lte.${corteLockPreso}`,
            )
            .select("id, user_id, lead_id, uazapi_instancia_id, debounce_buffer")
            .limit(100);

          if (reservaError) {
            console.error("[process-ia-debounce] falha ao reservar lotes:", reservaError);
          }

          for (const c of (reservadas ?? []) as unknown as ConversaReservada[]) {
            const buffer = Array.isArray(c.debounce_buffer) ? c.debounce_buffer : [];
            if (buffer.length === 0) {
              // Não devia acontecer (primeira_em só é setado junto com o
              // buffer), mas libera por segurança pra não ficar preso.
              await liberarLote(c.id, new Set());
              continue;
            }

            const tsProcessados = new Set(buffer.map((m) => m.ts));
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
              // Sempre libera — best-effort, evita ficar preso em loop de
              // retry se a IA estiver com problema.
              await liberarLote(c.id, tsProcessados);
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
