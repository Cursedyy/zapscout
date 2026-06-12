/**
 * Cron: processa aquecimento de número.
 * Chamado a cada 1-2 min via pg_cron.
 *
 * Para cada user com aquecimento ativo:
 *  - reseta contador diário se virou o dia
 *  - se ainda não atingiu meta do dia e proximo_envio_em <= now,
 *    envia 1 frase aleatória para o número de destino via UAZAPI
 *  - agenda próximo envio (2-15 min) e incrementa contador
 *  - desativa quando completar duracao_dias
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import { fraseAleatoria, intervaloAleatorioMs, metaDiaria } from "@/lib/aquecimento-shared";

const DIA_MS = 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/api/public/hooks/process-aquecimento")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-aquecimento");
        if (gate) return gate;

        const now = new Date();
        const hoje = now.toISOString().slice(0, 10);
        const results = {
          processed: 0,
          sent: 0,
          errors: 0,
          finished: 0,
          skipped_no_profile: 0,
          skipped_no_token: 0,
          skipped_not_connected: 0,
          skipped_no_numero_or_inicio: 0,
          skipped_meta_atingida: 0,
          skipped_intervalo: 0,
        };

        console.log("[cron-aquecimento] iniciando run", { ts: now.toISOString() });

        const { data: configs, error } = await supabaseAdmin
          .from("aquecimento_config")
          .select("*")
          .eq("ativo", true)
          .limit(500);

        if (error) {
          console.error("[cron-aquecimento] query erro:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        console.log("[cron-aquecimento] configs ativas encontradas:", configs?.length ?? 0);

        if (!configs || configs.length === 0) {
          return Response.json({ ok: true, ts: now.toISOString(), results });
        }

        const userIds = configs.map((c) => c.user_id);
        const { data: profiles, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id, uazapi_instance_token, uazapi_instance_status")
          .in("id", userIds);
        if (profErr) console.error("[cron-aquecimento] erro buscando profiles:", profErr);
        const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
        console.log("[cron-aquecimento] profiles encontrados:", profiles?.length ?? 0);

        for (const cfg of configs) {
          const prof = profMap.get(cfg.user_id);
          const ctx = {
            user_id: cfg.user_id,
            has_profile: !!prof,
            has_token: !!prof?.uazapi_instance_token,
            instance_status: prof?.uazapi_instance_status ?? null,
            has_numero: !!cfg.numero_destino,
            has_iniciado: !!cfg.iniciado_em,
          };

          if (!prof) {
            console.warn("[cron-aquecimento] skip: profile não encontrado", ctx);
            results.skipped_no_profile++;
            continue;
          }
          if (!prof.uazapi_instance_token) {
            console.warn("[cron-aquecimento] skip: token UazAPI ausente no profile", ctx);
            results.skipped_no_token++;
            continue;
          }
          if (prof.uazapi_instance_status !== "connected") {
            console.warn("[cron-aquecimento] skip: instância não conectada", ctx);
            results.skipped_not_connected++;
            continue;
          }
          if (!cfg.numero_destino || !cfg.iniciado_em) {
            console.warn("[cron-aquecimento] skip: numero_destino ou iniciado_em ausente", ctx);
            results.skipped_no_numero_or_inicio++;
            continue;
          }

          // Dia atual do aquecimento (1-indexed)
          const iniciadoMs = new Date(cfg.iniciado_em).getTime();
          const diaAtual = Math.floor((now.getTime() - iniciadoMs) / DIA_MS) + 1;

          // Concluído
          if (diaAtual > cfg.duracao_dias) {
            console.log("[cron-aquecimento] finalizando aquecimento", { user_id: cfg.user_id, diaAtual, duracao: cfg.duracao_dias });
            await supabaseAdmin
              .from("aquecimento_config")
              .update({ ativo: false })
              .eq("user_id", cfg.user_id);
            results.finished++;
            continue;
          }

          // Reset diário
          let mensagensHoje = cfg.mensagens_hoje ?? 0;
          let diaReferencia = cfg.dia_referencia;
          if (diaReferencia !== hoje) {
            mensagensHoje = 0;
            diaReferencia = hoje;
          }

          const meta = metaDiaria(diaAtual, cfg.duracao_dias);
          if (mensagensHoje >= meta) {
            console.log("[cron-aquecimento] meta diária atingida", { user_id: cfg.user_id, diaAtual, meta, mensagensHoje });
            results.skipped_meta_atingida++;
            if (diaReferencia !== cfg.dia_referencia) {
              await supabaseAdmin
                .from("aquecimento_config")
                .update({ dia_referencia: diaReferencia, mensagens_hoje: 0 })
                .eq("user_id", cfg.user_id);
            }
            continue;
          }

          if (cfg.proximo_envio_em && new Date(cfg.proximo_envio_em).getTime() > now.getTime()) {
            console.log("[cron-aquecimento] aguardando intervalo", { user_id: cfg.user_id, proximo_envio_em: cfg.proximo_envio_em });
            results.skipped_intervalo++;
            continue;
          }

          results.processed++;
          const texto = fraseAleatoria();
          console.log("[cron-aquecimento] enviando", { user_id: cfg.user_id, diaAtual, meta, mensagensHoje, destino: cfg.numero_destino });

          try {
            const r = await uazSendText(prof.uazapi_instance_token, cfg.numero_destino, texto);
            results.sent++;
            console.log("[cron-aquecimento] envio OK", { user_id: cfg.user_id, message_id: r.id ?? null });
            const proximo = new Date(now.getTime() + intervaloAleatorioMs()).toISOString();

            await supabaseAdmin
              .from("aquecimento_config")
              .update({
                mensagens_hoje: mensagensHoje + 1,
                dia_referencia: diaReferencia,
                ultimo_envio_em: now.toISOString(),
                proximo_envio_em: proximo,
                total_enviadas: (cfg.total_enviadas ?? 0) + 1,
              })
              .eq("user_id", cfg.user_id);

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: cfg.user_id,
              texto,
              status: "enviado",
              uazapi_message_id: r.id ?? null,
            });
          } catch (e) {
            results.errors++;
            console.error("[cron-aquecimento] envio FALHOU", { user_id: cfg.user_id, destino: cfg.numero_destino, error: e instanceof Error ? e.message : String(e) });
            await supabaseAdmin
              .from("aquecimento_config")
              .update({
                proximo_envio_em: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
              })
              .eq("user_id", cfg.user_id);
          }
        }

        console.log("[cron-aquecimento] run concluído", { results });
        return Response.json({ ok: true, ts: now.toISOString(), results });
      },
    },
  },
});
