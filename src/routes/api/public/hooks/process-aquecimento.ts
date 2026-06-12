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
          .select("id, wa_provider, wa_method, wa_server_url, wa_api_key, wa_instance_name, wa_meta_phone_id, wa_meta_token, uazapi_instance_token, uazapi_instance_status")
          .in("id", userIds);
        if (profErr) console.error("[cron-aquecimento] erro buscando profiles:", profErr);
        const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
        console.log("[cron-aquecimento] profiles encontrados:", profiles?.length ?? 0);

        for (const cfg of configs) {
          const prof = profMap.get(cfg.user_id);
          const isManagedReady =
            prof?.wa_method === "qrcode" &&
            prof?.wa_provider === "uazapi" &&
            !!prof?.uazapi_instance_token &&
            prof?.uazapi_instance_status === "connected";
          const isApiKeyReady =
            prof?.wa_method === "apikey" &&
            !!prof?.wa_provider &&
            (
              (prof.wa_provider === "uazapi" && !!prof.wa_server_url && !!prof.wa_api_key) ||
              (prof.wa_provider === "evolution" && !!prof.wa_server_url && !!prof.wa_api_key && !!prof.wa_instance_name) ||
              (prof.wa_provider === "meta" && !!prof.wa_meta_phone_id && !!prof.wa_meta_token)
            );
          const ctx = {
            user_id: cfg.user_id,
            has_profile: !!prof,
            provider: prof?.wa_provider ?? null,
            method: prof?.wa_method ?? null,
            managed_ready: isManagedReady,
            apikey_ready: isApiKeyReady,
            has_numero: !!cfg.numero_destino,
            has_iniciado: !!cfg.iniciado_em,
          };

          if (!prof) {
            console.warn("[cron-aquecimento] skip: profile não encontrado", ctx);
            results.skipped_no_profile++;
            continue;
          }
          if (!isManagedReady && !isApiKeyReady) {
            console.warn("[cron-aquecimento] skip: WhatsApp não conectado em nenhum provedor", ctx);
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
          // Busca última frase enviada para não repetir
          const { data: ultima } = await supabaseAdmin
            .from("mensagens_enviadas")
            .select("texto")
            .eq("user_id", cfg.user_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const texto = fraseAleatoria(ultima?.texto ?? null);
          console.log("[cron-aquecimento] enviando", { user_id: cfg.user_id, diaAtual, meta, mensagensHoje, destino: cfg.numero_destino, texto });

          try {
            const numeroLimpo = cfg.numero_destino.replace(/\D+/g, "");
            const numero55 = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;
            let messageId: string | null = null;

            if (isManagedReady) {
              const r = await uazSendText(prof.uazapi_instance_token!, numero55, texto);
              messageId = r.id ?? null;
            } else if (prof.wa_provider === "uazapi" && prof.wa_method === "apikey") {
              const url = `${prof.wa_server_url!.replace(/\/+$/, "")}/send/text`;
              const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: prof.wa_api_key! },
                body: JSON.stringify({ number: numero55, text: texto }),
              });
              if (!r.ok) throw new Error(`UAZAPI [${r.status}]: ${(await r.text()).slice(0, 300)}`);
              const j = (await r.json().catch(() => ({}))) as { messageid?: string; id?: string };
              messageId = j.messageid ?? j.id ?? null;
            } else if (prof.wa_provider === "evolution" && prof.wa_method === "apikey") {
              const url = `${prof.wa_server_url!.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(prof.wa_instance_name!)}`;
              const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: prof.wa_api_key! },
                body: JSON.stringify({ number: numero55, text: texto }),
              });
              if (!r.ok) throw new Error(`Evolution [${r.status}]: ${(await r.text()).slice(0, 300)}`);
              const j = (await r.json().catch(() => ({}))) as { key?: { id?: string } };
              messageId = j.key?.id ?? null;
            } else if (prof.wa_provider === "meta" && prof.wa_method === "apikey") {
              const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(prof.wa_meta_phone_id!)}/messages`;
              const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${prof.wa_meta_token!}` },
                body: JSON.stringify({ messaging_product: "whatsapp", to: numero55, type: "text", text: { body: texto } }),
              });
              if (!r.ok) throw new Error(`Meta [${r.status}]: ${(await r.text()).slice(0, 300)}`);
              const j = (await r.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
              messageId = j.messages?.[0]?.id ?? null;
            } else {
              throw new Error("Nenhum provedor WhatsApp pronto para envio");
            }

            results.sent++;
            console.log("[cron-aquecimento] envio OK", { user_id: cfg.user_id, message_id: messageId });
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
              uazapi_message_id: messageId,
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
