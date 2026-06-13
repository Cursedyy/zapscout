/**
 * Cron: processa aquecimento de número (multi-chip).
 * Chamado a cada 1-2 min via pg_cron.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import {
  fraseAleatoria,
  intervaloAleatorioMs,
  metaDiaria,
  type Intensidade,
  type TipoMensagem,
  getLimiteAquecimento,
} from "@/lib/aquecimento-shared";

const DIA_MS = 24 * 60 * 60 * 1000;

// "08:00" => 480
function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export const Route = createFileRoute("/api/public/hooks/process-aquecimento")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-aquecimento");
        if (gate) return gate;

        const now = new Date();
        const hoje = now.toISOString().slice(0, 10);
        const minutosAgora = now.getHours() * 60 + now.getMinutes();
        const diaSemana = now.getDay(); // 0=domingo

        const results = {
          processed: 0,
          sent: 0,
          errors: 0,
          finished: 0,
          skipped_no_profile: 0,
          skipped_not_connected: 0,
          skipped_no_numero_or_inicio: 0,
          skipped_meta_atingida: 0,
          skipped_intervalo: 0,
          skipped_fora_horario: 0,
          skipped_dia_semana: 0,
        };

        console.log("[cron-aquecimento] iniciando run", { ts: now.toISOString() });

        const { data: chips, error } = await supabaseAdmin
          .from("aquecimento_chips")
          .select("*")
          .eq("ativo", true)
          .limit(500);

        if (error) {
          console.error("[cron-aquecimento] query erro:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        console.log("[cron-aquecimento] chips ativos:", chips?.length ?? 0);
        if (!chips || chips.length === 0) {
          return Response.json({ ok: true, ts: now.toISOString(), results });
        }

        const userIds = Array.from(new Set(chips.map((c) => c.user_id)));
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select(
            "id, plano, wa_provider, wa_method, wa_server_url, wa_api_key, wa_instance_name, wa_meta_phone_id, wa_meta_token, uazapi_instance_token, uazapi_instance_status",
          )
          .in("id", userIds);
        const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));

        for (const chip of chips) {
          const prof = profMap.get(chip.user_id);
          const isManagedReady =
            prof?.wa_method === "qrcode" &&
            prof?.wa_provider === "uazapi" &&
            !!prof?.uazapi_instance_token &&
            prof?.uazapi_instance_status === "connected";
          const isApiKeyReady =
            prof?.wa_method === "apikey" &&
            !!prof?.wa_provider &&
            ((prof.wa_provider === "uazapi" && !!prof.wa_server_url && !!prof.wa_api_key) ||
              (prof.wa_provider === "evolution" &&
                !!prof.wa_server_url &&
                !!prof.wa_api_key &&
                !!prof.wa_instance_name) ||
              (prof.wa_provider === "meta" && !!prof.wa_meta_phone_id && !!prof.wa_meta_token));

          if (!prof) {
            results.skipped_no_profile++;
            continue;
          }
          // Plano não permite aquecimento — pausa o chip
          const limitePlano = getLimiteAquecimento(prof.plano);
          if (!limitePlano.permitido) {
            await supabaseAdmin
              .from("aquecimento_chips")
              .update({ ativo: false, status: "pausado", ultimo_erro: "Plano não permite aquecimento" })
              .eq("id", chip.id);
            results.skipped_no_profile++;
            continue;
          }
          if (!isManagedReady && !isApiKeyReady) {
            results.skipped_not_connected++;
            continue;
          }
          if (!chip.numero_destino || !chip.iniciado_em) {
            results.skipped_no_numero_or_inicio++;
            continue;
          }

          // Dia da semana permitido?
          const dias = (chip.dias_semana ?? []) as number[];
          if (!dias.includes(diaSemana)) {
            results.skipped_dia_semana++;
            continue;
          }

          // Janela de horário
          const ini = hhmmToMinutes(String(chip.horario_inicio).slice(0, 5));
          const fim = hhmmToMinutes(String(chip.horario_fim).slice(0, 5));
          if (minutosAgora < ini || minutosAgora >= fim) {
            results.skipped_fora_horario++;
            continue;
          }

          // Dia atual do aquecimento (1-indexed)
          const iniciadoMs = new Date(chip.iniciado_em).getTime();
          const diaAtual = Math.floor((now.getTime() - iniciadoMs) / DIA_MS) + 1;

          if (diaAtual > chip.duracao_dias) {
            await supabaseAdmin
              .from("aquecimento_chips")
              .update({ ativo: false, status: "concluido" })
              .eq("id", chip.id);
            results.finished++;
            continue;
          }

          // Reset diário
          let mensagensHoje = chip.mensagens_hoje ?? 0;
          let diaReferencia = chip.dia_referencia;
          if (diaReferencia !== hoje) {
            mensagensHoje = 0;
            diaReferencia = hoje;
          }

          const intensidade = (chip.intensidade ?? "moderado") as Intensidade;
          const tipo = (chip.tipo_mensagem ?? "misto") as TipoMensagem;
          const meta = metaDiaria(diaAtual, chip.duracao_dias, intensidade);

          if (mensagensHoje >= meta) {
            results.skipped_meta_atingida++;
            if (diaReferencia !== chip.dia_referencia) {
              await supabaseAdmin
                .from("aquecimento_chips")
                .update({ dia_referencia: diaReferencia, mensagens_hoje: 0 })
                .eq("id", chip.id);
            }
            continue;
          }

          if (chip.proximo_envio_em && new Date(chip.proximo_envio_em).getTime() > now.getTime()) {
            results.skipped_intervalo++;
            continue;
          }

          results.processed++;

          // Última frase enviada por esse chip
          const { data: ultima } = await supabaseAdmin
            .from("mensagens_enviadas")
            .select("texto")
            .eq("chip_id", chip.id)
            .order("enviado_em", { ascending: false })
            .limit(1)
            .maybeSingle();

          const texto = fraseAleatoria(tipo, ultima?.texto ?? null);
          const numeroLimpo = chip.numero_destino.replace(/\D+/g, "");
          const numero55 = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;

          try {
            let messageId: string | null = null;

            if (isManagedReady) {
              const r = await uazSendText(prof.uazapi_instance_token!, numero55, texto);
              messageId = r.id ?? null;
            } else if (prof.wa_provider === "uazapi") {
              const url = `${prof.wa_server_url!.replace(/\/+$/, "")}/send/text`;
              const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: prof.wa_api_key! },
                body: JSON.stringify({ number: numero55, text: texto }),
              });
              if (!r.ok)
                throw new Error(`UAZAPI [${r.status}]: ${(await r.text()).slice(0, 300)}`);
              const j = (await r.json().catch(() => ({}))) as {
                messageid?: string;
                id?: string;
              };
              messageId = j.messageid ?? j.id ?? null;
            } else if (prof.wa_provider === "evolution") {
              const url = `${prof.wa_server_url!.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(prof.wa_instance_name!)}`;
              const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: prof.wa_api_key! },
                body: JSON.stringify({ number: numero55, text: texto }),
              });
              if (!r.ok)
                throw new Error(`Evolution [${r.status}]: ${(await r.text()).slice(0, 300)}`);
              const j = (await r.json().catch(() => ({}))) as { key?: { id?: string } };
              messageId = j.key?.id ?? null;
            } else if (prof.wa_provider === "meta") {
              const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(prof.wa_meta_phone_id!)}/messages`;
              const r = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${prof.wa_meta_token!}`,
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: numero55,
                  type: "text",
                  text: { body: texto },
                }),
              });
              if (!r.ok)
                throw new Error(`Meta [${r.status}]: ${(await r.text()).slice(0, 300)}`);
              const j = (await r.json().catch(() => ({}))) as {
                messages?: Array<{ id?: string }>;
              };
              messageId = j.messages?.[0]?.id ?? null;
            } else {
              throw new Error("Nenhum provedor WhatsApp pronto para envio");
            }

            results.sent++;
            const proximo = new Date(now.getTime() + intervaloAleatorioMs()).toISOString();

            await supabaseAdmin
              .from("aquecimento_chips")
              .update({
                mensagens_hoje: mensagensHoje + 1,
                dia_referencia: diaReferencia,
                ultimo_envio_em: now.toISOString(),
                proximo_envio_em: proximo,
                total_enviadas: (chip.total_enviadas ?? 0) + 1,
                status: "aquecendo",
                ultimo_erro: null,
              })
              .eq("id", chip.id);

            await supabaseAdmin.from("mensagens_enviadas").insert({
              user_id: chip.user_id,
              chip_id: chip.id,
              texto,
              status: "enviado",
              uazapi_message_id: messageId,
            });
          } catch (e) {
            results.errors++;
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[cron-aquecimento] envio FALHOU", {
              chip_id: chip.id,
              user_id: chip.user_id,
              destino: chip.numero_destino,
              error: msg,
            });
            await supabaseAdmin
              .from("aquecimento_chips")
              .update({
                proximo_envio_em: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
                status: "erro",
                ultimo_erro: msg.slice(0, 500),
              })
              .eq("id", chip.id);
          }
        }

        console.log("[cron-aquecimento] run concluído", { results });
        return Response.json({ ok: true, ts: now.toISOString(), results });
      },
    },
  },
});
