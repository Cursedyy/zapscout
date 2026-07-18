/**
 * Cron: processa campanhas (agendadas + em andamento).
 * Chamado a cada 1 min via pg_cron.
 *
 * Lógica:
 *   1. Inicia campanhas agendadas cujo agendamento <= now.
 *   2. Para cada campanha em_andamento:
 *      - se last_sent_at + (3600/limite_por_hora)s > now: pula (respeita rate)
 *      - envia próximo item pendente via UAZAPI
 *      - marca item como enviado
 *      - se sem pendentes: marca campanha como concluida
 */
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";
import { gateCronHook } from "@/lib/hook-gate.server";
import { dispararWebhooksServer } from "@/lib/webhook-dispatch.server";
import { shouldFire, pickNextPendingIndex, applyRetry } from "@/lib/campanhas-throttle";
import { mensagemErro, detectarRestricaoInstancia } from "@/lib/traduzir-erro";
import { isCelularBR } from "@/lib/telefone";
import { renderSpintax } from "@/lib/spintax";
import { intervaloComJitter } from "@/lib/anti-ban";
import {
  carregarProfileAntiBan,
  podeEnviar,
  registrarEnvioSucesso,
  registrarEnvioFalha,
} from "@/lib/anti-ban.server";
import { resolveTokenParaConversa } from "@/lib/uazapi-resolve.server";

/** Teto de segurança por instância, independente do que as campanhas somadas
 * configurem — número não-oficial via UAZAPI/Baileys corre risco de ban se
 * o volume total (múltiplas campanhas simultâneas) passar disso. */
const TETO_HORARIO_INSTANCIA = 60;

type CampItem = {
  leadId: string;
  externalId?: string;
  numero?: string | null;
  nome?: string | null;
  status: "pendente" | "enviado" | "falha" | "pulado";
  sentAt?: string;
  attempts?: number;
  nextRetryAt?: string;
  lastError?: string;
};

type DispatchLog = {
  user_id: string;
  campanha_id: string;
  campanha_nome?: string | null;
  lead_id?: string | null;
  lead_nome?: string | null;
  numero?: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status: string;
  attempt?: number | null;
  http_status?: number | null;
  error_message?: string | null;
};

async function insertDispatchLog(row: DispatchLog) {
  try {
    await supabaseAdmin.from("campanha_dispatch_logs").insert(row as never);
  } catch (e) {
    console.error("[cron-campaigns] falha ao gravar dispatch_log:", e);
  }
}

/**
 * Cria uma notificação para o usuário, deduplicando por (tipo, link) dentro de
 * uma janela de tempo — evita spam quando o cron roda a cada minuto e o mesmo
 * problema persiste (ex.: WhatsApp desconectado, campanha pausada por rate-limit).
 */
async function notifyOnce(params: {
  userId: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  link?: string | null;
  dedupeWindowMin?: number;
}) {
  const dedupeWindowMin = params.dedupeWindowMin ?? 60;
  try {
    const since = new Date(Date.now() - dedupeWindowMin * 60_000).toISOString();
    let query = supabaseAdmin
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.userId)
      .eq("tipo", params.tipo)
      .eq("lida", false)
      .gte("created_at", since);
    if (params.link) query = query.eq("link", params.link);
    const { count } = await query;
    if ((count ?? 0) > 0) return;

    await supabaseAdmin.from("notificacoes").insert({
      user_id: params.userId,
      tipo: params.tipo,
      titulo: params.titulo,
      descricao: params.descricao ?? null,
      link: params.link ?? null,
    });
  } catch (e) {
    console.error("[cron-campaigns] falha ao gravar notificação:", e);
  }
}

/**
 * Quando a UazAPI sinaliza que a PRÓPRIA instância foi restringida/bloqueada
 * (não confundir com "número não está no WhatsApp", que é sobre o
 * destinatário — ver `detectarRestricaoInstancia`): pausa TODAS as campanhas
 * em andamento do usuário nessa instância — elas compartilham o mesmo token,
 * deixar as outras tentando uma a uma só reproduziria o mesmo erro — e
 * alerta o usuário.
 *
 * O alerta por WhatsApp é best-effort e reusa a MESMA instância que acabou de
 * falhar (hoje não existe canal de saída alternativo) — se a instância está
 * de fato banida, esse envio também pode falhar. A notificação de dashboard
 * (`notificacoes`) é o canal garantido, funciona independente do estado da
 * instância.
 */
async function pausarTodasCampanhasPorRestricao(params: {
  userId: string;
  motivo: string;
  httpStatus: number;
}): Promise<number> {
  const { userId, motivo, httpStatus } = params;
  const { data: ativas } = await supabaseAdmin
    .from("campanhas")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "em_andamento");
  const ids = (ativas ?? []).map((c) => c.id as string);
  if (ids.length > 0) {
    await supabaseAdmin.from("campanhas").update({ status: "pausada" }).in("id", ids);
  }

  await notifyOnce({
    userId,
    tipo: "instancia_restrita",
    titulo: "Instância de WhatsApp restringida — campanhas pausadas",
    descricao: `Detectamos um sinal de restrição/bloqueio na sua instância de WhatsApp (http ${httpStatus || "?"}: ${motivo.slice(0, 200)}). Pausamos automaticamente ${ids.length} campanha(s) em andamento para proteger o número. Verifique o status da conta antes de retomar manualmente.`,
    link: "/app/campanhas",
    dedupeWindowMin: 240,
  });

  try {
    const { data: cfg } = await supabaseAdmin
      .from("ia_config")
      .select("telefone_alerta")
      .eq("user_id", userId)
      .maybeSingle();
    const telefoneAlerta = (cfg as { telefone_alerta?: string | null } | null)?.telefone_alerta;
    if (telefoneAlerta) {
      const token = await resolveTokenParaConversa(userId, null);
      if (token) {
        const limpo = telefoneAlerta.replace(/\D+/g, "");
        const numeroAlerta = limpo.startsWith("55") ? limpo : `55${limpo}`;
        await uazSendText(
          token,
          numeroAlerta,
          `⚠️ Sua instância de WhatsApp parece ter sido restringida/bloqueada pelo provedor (${motivo.slice(0, 150)}). Pausamos automaticamente ${ids.length} campanha(s) em andamento. Verifique a conta antes de retomar manualmente.`,
        );
      }
    }
  } catch (alertErr) {
    console.error(
      "[cron-campaigns] falha ao enviar alerta de restrição via WhatsApp (best-effort, instância pode estar mesmo banida):",
      alertErr,
    );
  }

  return ids.length;
}

/**
 * Sinal ambíguo de possível restrição (ver `detectarRestricaoInstancia`) —
 * NÃO pausa nada (evita falso positivo), só loga e notifica o dashboard pra
 * o usuário verificar manualmente.
 */
async function alertarRestricaoAmbigua(params: {
  userId: string;
  campanhaNome?: string | null;
  motivo: string;
  httpStatus: number;
}): Promise<void> {
  const { userId, campanhaNome, motivo, httpStatus } = params;
  console.warn(
    "[cron-campaigns] SINAL AMBÍGUO de possível restrição de instância (NÃO pausando — ver limitação conhecida em detectarRestricaoInstancia):",
    { userId, httpStatus, motivo },
  );
  await notifyOnce({
    userId,
    tipo: "instancia_restricao_suspeita",
    titulo: "Possível restrição no WhatsApp — verifique manualmente",
    descricao: `A campanha "${campanhaNome ?? "sem nome"}" recebeu um erro incomum (http ${httpStatus || "?"}: ${motivo.slice(0, 200)}) que PODE indicar restrição da conta, mas não temos certeza — não pausamos automaticamente para evitar falso positivo. Recomendamos verificar a conexão/status da conta manualmente.`,
    link: "/app/campanhas",
    dedupeWindowMin: 120,
  });
}

function renderVars(template: string, lead: Record<string, unknown>): string {
  const vars: Record<string, string> = {
    nome: String(lead.nome_empresa ?? lead.nome ?? ""),
    empresa: String(lead.nome_empresa ?? lead.nome ?? ""),
    cidade: String(lead.cidade ?? ""),
    nicho: String(lead.nicho ?? lead.segmento ?? ""),
    avaliacao: lead.avaliacao != null ? String(lead.avaliacao) : "—",
    telefone: String(lead.telefone ?? lead.whatsapp ?? ""),
    endereco: String(lead.endereco ?? ""),
  };
  // 1) Spintax {a|b|c} antes das variáveis para variar a mensagem por envio.
  const comSpin = renderSpintax(template);
  return comSpin.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export const Route = createFileRoute("/api/public/hooks/process-campaigns")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-campaigns");
        if (gate) return gate;

        const runStart = Date.now();
        const now = runStart;
        const results = { started: 0, sent: 0, completed: 0, errors: 0, skipped: 0 };
        const detalhes: Array<{
          campanhaId: string;
          nome?: string | null;
          userId: string;
          resultado: string;
          leadId?: string | null;
          pendentesAntes?: number;
          motivo?: string;
        }> = [];
        let leadsSelecionados = 0;
        let runOk = true;
        let runError: string | null = null;

        try {
          // 1. Inicia agendadas
          const { data: agendadas } = await supabaseAdmin
            .from("campanhas")
            .select("id, nome, user_id, agendamento")
            .eq("status", "agendada")
            .lte("agendamento", new Date().toISOString())
            .limit(100);

          for (const c of agendadas ?? []) {
            await supabaseAdmin
              .from("campanhas")
              .update({ status: "em_andamento", started_at: new Date().toISOString() })
              .eq("id", c.id);
            results.started++;
            detalhes.push({
              campanhaId: c.id,
              nome: c.nome,
              userId: c.user_id,
              resultado: "iniciada_agendada",
            });
          }

          // 2. Processa em andamento
          const { data: campanhas } = await supabaseAdmin
            .from("campanhas")
            .select(
              "id, nome, user_id, mensagem_override, mensagem, limite_por_hora, items, last_sent_at",
            )
            .eq("status", "em_andamento")
            .limit(100);

          leadsSelecionados = (campanhas ?? []).reduce((acc, c) => {
            const its = (c.items as unknown as CampItem[]) ?? [];
            return acc + its.filter((it) => it.status === "pendente").length;
          }, 0);

          const userIds = [...new Set((campanhas ?? []).map((c) => c.user_id))];
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id, uazapi_instance_token, uazapi_instance_status")
            .in("id", userIds);
          const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

          // Rate limit POR INSTÂNCIA (não por campanha): hoje toda campanha de
          // um usuário usa o mesmo profiles.uazapi_instance_token, então
          // "instância" == user_id. Usa o MAIOR limite_por_hora configurado
          // entre as campanhas ativas do usuário como teto pretendido (respeita
          // a intenção do usuário quando ele sobe o limite de propósito), mas
          // nunca deixa passar de TETO_HORARIO_INSTANCIA — protege contra N
          // campanhas simultâneas (ex.: 5×20/h) somando muito mais do que
          // qualquer limite individual sugere.
          const limitesPorUser = new Map<string, number>();
          for (const c of campanhas ?? []) {
            const atual = limitesPorUser.get(c.user_id) ?? 0;
            limitesPorUser.set(c.user_id, Math.max(atual, c.limite_por_hora ?? 20));
          }
          const enviosInstanciaCache = new Map<string, number>();
          async function contarEnviosInstanciaUltimaHora(userId: string): Promise<number> {
            if (enviosInstanciaCache.has(userId)) return enviosInstanciaCache.get(userId)!;
            const desde = new Date(now - 60 * 60_000).toISOString();
            const { count } = await supabaseAdmin
              .from("mensagens_enviadas")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("status", "enviado")
              .not("campanha_id", "is", null)
              .gte("enviado_em", desde);
            const total = count ?? 0;
            enviosInstanciaCache.set(userId, total);
            return total;
          }

          // Cache das checagens anti-ban por usuário (uma por tick, não por campanha).
          const antiBanCache = new Map<string, Awaited<ReturnType<typeof podeEnviar>>>();
          async function checarAntiBan(userId: string) {
            if (antiBanCache.has(userId)) return antiBanCache.get(userId)!;
            const prof = await carregarProfileAntiBan(userId);
            const r = prof
              ? await podeEnviar(prof, "auto")
              : { ok: true as const, enviadosHoje: 0, limite: 999 };
            antiBanCache.set(userId, r);
            return r;
          }

          for (const c of campanhas ?? []) {
            const profile = profileMap.get(c.user_id);
            if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "connected") {
              console.warn(
                "[cron-campaigns] PAUSANDO campanha",
                c.id,
                "— perfil sem WhatsApp conectado.",
              );
              await supabaseAdmin.from("campanhas").update({ status: "pausada" }).eq("id", c.id);
              results.skipped++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: "pausada_sem_whatsapp",
              });
              await notifyOnce({
                userId: c.user_id,
                tipo: "campanha_pausada",
                titulo: "Campanha pausada — WhatsApp desconectado",
                descricao: `A campanha "${c.nome ?? "sem nome"}" foi pausada porque o WhatsApp não está conectado. Reconecte para retomar os envios.`,
                link: `/app/campanhas`,
                dedupeWindowMin: 120,
              });
              continue;
            }

            // Anti-restrição: pausa temporária, janela de horário, limite diário.
            const ab = await checarAntiBan(c.user_id);
            if (!ab.ok) {
              results.skipped++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: `anti_ban_${ab.motivo}`,
                motivo: ab.mensagem,
              });
              continue;
            }

            // Rate limit POR INSTÂNCIA — soma envios de TODAS as campanhas do
            // usuário (mesmo token) nos últimos 60min, não só desta campanha.
            const limiteInstancia = Math.min(
              TETO_HORARIO_INSTANCIA,
              limitesPorUser.get(c.user_id) ?? 20,
            );
            const enviosInstancia = await contarEnviosInstanciaUltimaHora(c.user_id);
            if (enviosInstancia >= limiteInstancia) {
              results.skipped++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: "aguardando_limite_instancia",
                motivo: `Instância já enviou ${enviosInstancia}/${limiteInstancia} na última hora (somando todas as campanhas)`,
              });
              continue;
            }

            // Rate limit COM jitter — ±35% no intervalo esperado para não parecer robô.
            const lastTs = c.last_sent_at ? new Date(c.last_sent_at).getTime() : 0;
            const intervaloBaseMs = Math.floor(3_600_000 / Math.max(1, c.limite_por_hora ?? 20));
            const intervaloComJitterMs =
              intervaloComJitter(Math.round(intervaloBaseMs / 1000)) * 1000;
            if (lastTs > 0 && now - lastTs < intervaloComJitterMs) {
              results.skipped++;
              const waitMs = intervaloComJitterMs - (now - lastTs);
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: "aguardando_intervalo",
                motivo: `Faltam ${Math.ceil(waitMs / 1000)}s (jitter ativo)`,
              });
              continue;
            }
            // Silencia lint: shouldFire foi substituído por checagem com jitter acima.
            void shouldFire;

            const items = (c.items as unknown as CampItem[]) ?? [];
            const pendentesAntes = items.filter((it) => it.status === "pendente").length;
            const nextIdx = pickNextPendingIndex(items, now);
            if (nextIdx === -1) {
              // Só marca concluída se realmente não há mais pendentes (mesmo aguardando retry).
              const aindaPendente = items.some((it) => it.status === "pendente");
              if (!aindaPendente) {
                await supabaseAdmin
                  .from("campanhas")
                  .update({ status: "concluida" })
                  .eq("id", c.id);
                results.completed++;
                detalhes.push({
                  campanhaId: c.id,
                  nome: c.nome,
                  userId: c.user_id,
                  resultado: "concluida",
                  pendentesAntes,
                });
              } else {
                results.skipped++;
                detalhes.push({
                  campanhaId: c.id,
                  nome: c.nome,
                  userId: c.user_id,
                  resultado: "aguardando_retry",
                  pendentesAntes,
                });
              }
              continue;
            }

            const item = items[nextIdx];
            let numero = item.numero ?? "";
            const dispatchStart = Date.now();
            const dispatchStartIso = new Date(dispatchStart).toISOString();

            // Fallback: se o snapshot da campanha não tem número, busca do lead
            // (o lead pode ter recebido whatsapp/telefone após a campanha ser criada).
            type LeadLookup = {
              nome_empresa?: string | null;
              cidade?: string | null;
              nicho?: string | null;
              segmento?: string | null;
              endereco?: string | null;
              avaliacao?: number | string | null;
              telefone?: string | null;
              whatsapp?: string | null;
            };
            let leadCache: LeadLookup | null = null;
            if (!numero) {
              const { data: leadLookup } = await supabaseAdmin
                .from("leads")
                .select(
                  "nome_empresa, cidade, nicho, segmento, endereco, avaliacao, telefone, whatsapp",
                )
                .eq("id", item.leadId)
                .maybeSingle();
              leadCache = (leadLookup as LeadLookup | null) ?? null;
              const raw = (leadCache?.whatsapp || leadCache?.telefone || "").toString();
              const digits = raw.replace(/\D+/g, "");
              if (digits) {
                numero = digits;
                items[nextIdx] = { ...item, numero };
              }
            }

            if (!numero) {
              items[nextIdx] = { ...item, status: "pulado" };
              await supabaseAdmin
                .from("campanhas")
                .update({ items: items as never, last_sent_at: new Date().toISOString() })
                .eq("id", c.id);
              const finishedAt = new Date();
              await insertDispatchLog({
                user_id: c.user_id,
                campanha_id: c.id,
                campanha_nome: c.nome,
                lead_id: item.leadId,
                lead_nome: item.nome ?? null,
                numero: null,
                started_at: dispatchStartIso,
                finished_at: finishedAt.toISOString(),
                duration_ms: finishedAt.getTime() - dispatchStart,
                status: "sem_numero",
                attempt: item.attempts ?? null,
                error_message: "Lead sem número cadastrado — pulado",
              });
              results.skipped++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: "sem_numero",
                leadId: item.leadId,
                pendentesAntes,
              });
              continue;
            }

            // Backstop: número presente mas em formato de fixo (sem 9º dígito) —
            // nunca vai ter WhatsApp. Filtro barato ANTES da UazAPI (não
            // substitui a checagem real do provedor). Cobre itens de campanhas
            // criadas antes desta validação existir em createCampanhaRemote, e
            // o fallback de lookup direto do lead acima (linha ~459).
            if (!isCelularBR(numero)) {
              items[nextIdx] = { ...item, status: "pulado" };
              await supabaseAdmin
                .from("campanhas")
                .update({ items: items as never, last_sent_at: new Date().toISOString() })
                .eq("id", c.id);
              const finishedAt = new Date();
              await insertDispatchLog({
                user_id: c.user_id,
                campanha_id: c.id,
                campanha_nome: c.nome,
                lead_id: item.leadId,
                lead_nome: item.nome ?? null,
                numero,
                started_at: dispatchStartIso,
                finished_at: finishedAt.toISOString(),
                duration_ms: finishedAt.getTime() - dispatchStart,
                status: "telefone_fixo",
                attempt: item.attempts ?? null,
                error_message: "Número em formato de telefone fixo (sem 9º dígito) — pulado antes da UazAPI",
              });
              const { data: leadAtual } = await supabaseAdmin
                .from("leads")
                .select("status, history")
                .eq("id", item.leadId)
                .maybeSingle();
              if (leadAtual) {
                const hist = Array.isArray(leadAtual.history) ? (leadAtual.history as unknown[]) : [];
                const novoHist = [
                  ...hist,
                  { ts: Date.now(), text: "Campanha — telefone fixo detectado (sem 9º dígito), não enviado" },
                ];
                await supabaseAdmin
                  .from("leads")
                  .update({ status: "sem_numero", history: novoHist as never })
                  .eq("id", item.leadId);
                if (leadAtual.status !== "sem_numero") {
                  const { logLeadStatusChange } = await import("@/lib/leads-audit.server");
                  await logLeadStatusChange({
                    leadId: item.leadId,
                    userId: c.user_id,
                    statusAnterior: leadAtual.status,
                    statusNovo: "sem_numero",
                    origem: "cron:process-campaigns",
                    detalhes: { campanha_id: c.id, motivo: "telefone_fixo" },
                  });
                }
              }
              results.skipped++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: "telefone_fixo",
                leadId: item.leadId,
                pendentesAntes,
              });
              continue;
            }

            // Verifica se o lead já foi prospectado anteriormente (qualquer campanha do user, incluindo a atual)
            const { count: jaProspectado } = await supabaseAdmin
              .from("mensagens_enviadas")
              .select("id", { count: "exact", head: true })
              .eq("user_id", c.user_id)
              .eq("lead_id", item.leadId);

            if ((jaProspectado ?? 0) > 0) {
              console.log("[cron-campaigns] PULANDO lead já prospectado:", item.leadId);
              items[nextIdx] = { ...item, status: "pulado" };
              await supabaseAdmin
                .from("campanhas")
                .update({ items: items as never })
                .eq("id", c.id);
              const finishedAt = new Date();
              await insertDispatchLog({
                user_id: c.user_id,
                campanha_id: c.id,
                campanha_nome: c.nome,
                lead_id: item.leadId,
                lead_nome: item.nome ?? null,
                numero,
                started_at: dispatchStartIso,
                finished_at: finishedAt.toISOString(),
                duration_ms: finishedAt.getTime() - dispatchStart,
                status: "ja_prospectado",
                attempt: item.attempts ?? null,
                error_message: "Lead já prospectado anteriormente",
              });
              results.skipped++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: "ja_prospectado",
                leadId: item.leadId,
                pendentesAntes,
              });
              continue;
            }

            // Resolve lead pra renderizar variáveis (reusa cache se já foi buscado no fallback de número)
            let lead: LeadLookup | null = leadCache;
            if (!lead) {
              const { data: leadFetched } = await supabaseAdmin
                .from("leads")
                .select(
                  "nome_empresa, cidade, nicho, segmento, endereco, avaliacao, telefone, whatsapp",
                )
                .eq("id", item.leadId)
                .maybeSingle();
              lead = (leadFetched as LeadLookup | null) ?? null;
            }

            const template = c.mensagem_override || c.mensagem || "";
            const texto = renderVars(template, (lead ?? {}) as Record<string, unknown>);

            try {
              const r = await uazSendText(profile.uazapi_instance_token, numero, texto);
              const finishedAt = new Date();
              items[nextIdx] = { ...item, status: "enviado", sentAt: finishedAt.toISOString() };
              const restantes = items.filter((it) => it.status === "pendente").length;
              await supabaseAdmin
                .from("campanhas")
                .update({
                  items: items as never,
                  last_sent_at: finishedAt.toISOString(),
                  status: restantes === 0 ? "concluida" : "em_andamento",
                })
                .eq("id", c.id);

              // Idempotência: chave determinística por tentativa lógica.
              // Se o cron rodar sobreposto ou fizer retry após falha transitória
              // do banco, o upsert com onConflict evita gravar row duplicada.
              const attemptEnviado = (item.attempts ?? 0) + 1;
              await supabaseAdmin.from("mensagens_enviadas").upsert(
                {
                  user_id: c.user_id,
                  lead_id: item.leadId,
                  campanha_id: c.id,
                  texto,
                  status: "enviado",
                  uazapi_message_id: r.id ?? null,
                  idempotency_key: `campanha:${c.id}:lead:${item.leadId}:enviado:${attemptEnviado}`,
                },
                { onConflict: "idempotency_key", ignoreDuplicates: true },
              );

              await insertDispatchLog({
                user_id: c.user_id,
                campanha_id: c.id,
                campanha_nome: c.nome,
                lead_id: item.leadId,
                lead_nome:
                  (lead as { nome_empresa?: string } | null)?.nome_empresa ?? item.nome ?? null,
                numero,
                started_at: dispatchStartIso,
                finished_at: finishedAt.toISOString(),
                duration_ms: finishedAt.getTime() - dispatchStart,
                status: "enviado",
                attempt: (item.attempts ?? 0) + 1,
              });

              // Move lead para "contatado" se estiver "novo" e registra no histórico
              const { data: leadAtual } = await supabaseAdmin
                .from("leads")
                .select("status, history, nome_empresa")
                .eq("id", item.leadId)
                .maybeSingle();
              if (leadAtual) {
                const hist = Array.isArray(leadAtual.history)
                  ? (leadAtual.history as unknown[])
                  : [];
                const podeMover = leadAtual.status === "novo";
                const novoHist: unknown[] = [
                  ...hist,
                  { ts: Date.now(), text: `Campanha — mensagem enviada` },
                ];
                if (podeMover) {
                  novoHist.push({
                    ts: Date.now(),
                    text: "Movido automaticamente para Contatado — mensagem enviada",
                  });
                }
                const { moverLeadStatus } = await import("@/lib/leads-audit.server");
                const moveu = await moverLeadStatus({
                  db: supabaseAdmin as unknown as SupabaseClient,
                  leadId: item.leadId,
                  userId: c.user_id,
                  statusAtual: leadAtual.status,
                  novoStatus: "contatado",
                  permitidoDe: ["novo"],
                  origem: "cron:process-campaigns",
                  detalhes: { campanha_id: c.id, campanha_nome: c.nome },
                  patchExtra: { history: novoHist },
                });
                if (moveu) {
                  await dispararWebhooksServer(c.user_id, "lead_status_alterado", {
                    id: item.leadId,
                    status: "contatado",
                    nome: leadAtual.nome_empresa,
                  });
                }
              }

              results.sent++;
              await registrarEnvioSucesso(c.user_id);
              antiBanCache.delete(c.user_id); // limite pode ter mudado
              enviosInstanciaCache.set(c.user_id, (enviosInstanciaCache.get(c.user_id) ?? 0) + 1);
              if (restantes === 0) results.completed++;
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: restantes === 0 ? "enviado_e_concluida" : "enviado",
                leadId: item.leadId,
                pendentesAntes,
              });
            } catch (e) {
              // LOG DETALHADO p/ diagnosticar por que números sem WhatsApp pausam a campanha
              const errAny = e as {
                message?: unknown;
                status?: unknown;
                response?: unknown;
                cause?: unknown;
                stack?: unknown;
                name?: unknown;
              };
              console.error("[cron-campaigns] ===== ERRO ENVIO DETALHADO =====");
              console.error("[cron-campaigns] campanha_id:", c.id);
              console.error("[cron-campaigns] lead_id:", item.leadId);
              console.error("[cron-campaigns] numero:", numero);
              console.error("[cron-campaigns] typeof e:", typeof e);
              console.error("[cron-campaigns] e.name:", errAny?.name);
              console.error("[cron-campaigns] e.message:", errAny?.message);
              console.error("[cron-campaigns] e.status:", errAny?.status);
              console.error("[cron-campaigns] e.response:", errAny?.response);
              console.error("[cron-campaigns] e.cause:", errAny?.cause);
              console.error("[cron-campaigns] e.stack:", errAny?.stack);
              try {
                console.error(
                  "[cron-campaigns] JSON.stringify(e):",
                  JSON.stringify(e, Object.getOwnPropertyNames(e as object)),
                );
              } catch {
                console.error("[cron-campaigns] e (raw):", e);
              }
              console.error("[cron-campaigns] ===== FIM ERRO DETALHADO =====");

              const msg = mensagemErro(e);
              const statusMatch = msg.match(/\[(\d{3})\]/);
              const httpStatus = statusMatch ? Number(statusMatch[1]) : 0;
              // NOTA: httpStatus === 500 NÃO é mais tratado automaticamente como
              // "número não está no WhatsApp" — um 500 pode ser um erro real de
              // conta/instância, e tratá-lo sempre como semWhats escondia esse
              // sinal antes que a detecção de restrição abaixo pudesse vê-lo.
              const semWhats =
                /is not on whatsapp|not.*whatsapp.*user|number.*not.*exist|invalid.*(number|jid)/i.test(
                  msg,
                );
              const restricao = semWhats ? null : detectarRestricaoInstancia(msg, httpStatus);
              console.error("[cron-campaigns] msg parseada:", msg);
              console.error(
                "[cron-campaigns] httpStatus detectado:",
                httpStatus,
                "| semWhats:",
                semWhats,
                "| restricao:",
                restricao,
                "| pausar (401):",
                httpStatus === 401,
              );

              if (restricao === "confirmada") {
                // Mantém item pendente pra retomar quando o usuário reativar
                // manualmente (não é falha do lead, é da instância).
                const finishedAt = new Date();
                await supabaseAdmin
                  .from("campanhas")
                  .update({ items: items as never, last_sent_at: finishedAt.toISOString() })
                  .eq("id", c.id);
                await supabaseAdmin.from("mensagens_enviadas").upsert(
                  {
                    user_id: c.user_id,
                    lead_id: item.leadId,
                    campanha_id: c.id,
                    texto,
                    status: "falha",
                    idempotency_key: `campanha:${c.id}:lead:${item.leadId}:restricao:${(item.attempts ?? 0) + 1}`,
                  },
                  { onConflict: "idempotency_key", ignoreDuplicates: true },
                );
                const campanhasPausadas = await pausarTodasCampanhasPorRestricao({
                  userId: c.user_id,
                  motivo: msg,
                  httpStatus,
                });
                await insertDispatchLog({
                  user_id: c.user_id,
                  campanha_id: c.id,
                  campanha_nome: c.nome,
                  lead_id: item.leadId,
                  lead_nome:
                    (lead as { nome_empresa?: string } | null)?.nome_empresa ?? item.nome ?? null,
                  numero,
                  started_at: dispatchStartIso,
                  finished_at: finishedAt.toISOString(),
                  duration_ms: finishedAt.getTime() - dispatchStart,
                  status: "restricao_instancia",
                  attempt: (item.attempts ?? 0) + 1,
                  http_status: httpStatus || null,
                  error_message: msg,
                });
                results.errors++;
                antiBanCache.delete(c.user_id);
                detalhes.push({
                  campanhaId: c.id,
                  nome: c.nome,
                  userId: c.user_id,
                  resultado: "restricao_instancia",
                  leadId: item.leadId,
                  pendentesAntes,
                  motivo: `${msg} (${campanhasPausadas} campanha(s) pausada(s))`,
                });
                continue;
              }

              if (restricao === "ambigua") {
                await alertarRestricaoAmbigua({
                  userId: c.user_id,
                  campanhaNome: c.nome,
                  motivo: msg,
                  httpStatus,
                });
                // Não pausa, não faz continue — segue para o tratamento normal
                // de falha/retry abaixo (mesmo item, mesma campanha).
              }

              const pausar = httpStatus === 401;

              if (pausar) {
                // Mantém item como pendente para reprocessar quando a campanha voltar
                const finishedAt = new Date();
                await supabaseAdmin
                  .from("campanhas")
                  .update({ status: "pausada", last_sent_at: finishedAt.toISOString() })
                  .eq("id", c.id);
                await supabaseAdmin.from("mensagens_enviadas").upsert(
                  {
                    user_id: c.user_id,
                    lead_id: item.leadId,
                    campanha_id: c.id,
                    texto,
                    status: "falha",
                    idempotency_key: `campanha:${c.id}:lead:${item.leadId}:pausada:${(item.attempts ?? 0) + 1}`,
                  },
                  { onConflict: "idempotency_key", ignoreDuplicates: true },
                );
                await insertDispatchLog({
                  user_id: c.user_id,
                  campanha_id: c.id,
                  campanha_nome: c.nome,
                  lead_id: item.leadId,
                  lead_nome:
                    (lead as { nome_empresa?: string } | null)?.nome_empresa ?? item.nome ?? null,
                  numero,
                  started_at: dispatchStartIso,
                  finished_at: finishedAt.toISOString(),
                  duration_ms: finishedAt.getTime() - dispatchStart,
                  status: "pausada_auth",
                  attempt: (item.attempts ?? 0) + 1,
                  http_status: httpStatus || null,
                  error_message: msg,
                });
                results.errors++;
                await registrarEnvioFalha(c.user_id, msg);
                antiBanCache.delete(c.user_id);
                detalhes.push({
                  campanhaId: c.id,
                  nome: c.nome,
                  userId: c.user_id,
                  resultado: "pausada_auth",
                  leadId: item.leadId,
                  pendentesAntes,
                  motivo: msg,
                });
                await notifyOnce({
                  userId: c.user_id,
                  tipo: "campanha_pausada",
                  titulo: "Campanha pausada — falha de autenticação no WhatsApp",
                  descricao: `A campanha "${c.nome ?? "sem nome"}" foi pausada porque o WhatsApp respondeu com erro de autenticação (401). Reconecte a instância e retome.`,
                  link: `/app/campanhas`,
                  dedupeWindowMin: 120,
                });
                continue;
              }

              // "semWhats" é definitivo (pulado). Demais erros usam retry com backoff:
              // mantém item como pendente, agenda `nextRetryAt`, e só marca "falha"
              // após MAX_RETRY_ATTEMPTS. `last_sent_at` continua sendo atualizado
              // para NÃO quebrar o intervalo global da campanha.
              let statusRegistrado: "pulado" | "falha" | "pendente";
              if (semWhats) {
                items[nextIdx] = { ...item, status: "pulado" };
                statusRegistrado = "pulado";
              } else {
                const { item: novoItem, giveUp } = applyRetry(item, now, msg);
                items[nextIdx] = novoItem;
                statusRegistrado = giveUp ? "falha" : "pendente";
                console.warn(
                  "[cron-campaigns] retry agendado",
                  "campanha_id:",
                  c.id,
                  "lead_id:",
                  item.leadId,
                  "attempts:",
                  novoItem.attempts,
                  "nextRetryAt:",
                  novoItem.nextRetryAt,
                  "giveUp:",
                  giveUp,
                );
              }
              const finishedAt = new Date();
              await supabaseAdmin
                .from("campanhas")
                .update({ items: items as never, last_sent_at: finishedAt.toISOString() })
                .eq("id", c.id);
              const statusFinal = statusRegistrado === "pendente" ? "falha" : statusRegistrado;
              const itemAtualParaKey = items[nextIdx];
              const attemptFalha = itemAtualParaKey.attempts ?? (item.attempts ?? 0) + 1;
              await supabaseAdmin.from("mensagens_enviadas").upsert(
                {
                  user_id: c.user_id,
                  lead_id: item.leadId,
                  campanha_id: c.id,
                  texto,
                  status: statusFinal,
                  idempotency_key: `campanha:${c.id}:lead:${item.leadId}:${statusRegistrado}:${attemptFalha}`,
                },
                { onConflict: "idempotency_key", ignoreDuplicates: true },
              );
              const itemAtual = items[nextIdx];
              await insertDispatchLog({
                user_id: c.user_id,
                campanha_id: c.id,
                campanha_nome: c.nome,
                lead_id: item.leadId,
                lead_nome:
                  (lead as { nome_empresa?: string } | null)?.nome_empresa ?? item.nome ?? null,
                numero,
                started_at: dispatchStartIso,
                finished_at: finishedAt.toISOString(),
                duration_ms: finishedAt.getTime() - dispatchStart,
                status: semWhats
                  ? "sem_whatsapp"
                  : statusRegistrado === "pendente"
                    ? "retry_agendado"
                    : "falha",
                attempt: itemAtual.attempts ?? (item.attempts ?? 0) + 1,
                http_status: httpStatus || null,
                error_message: msg,
              });

              if (semWhats) {
                const { data: leadAtual } = await supabaseAdmin
                  .from("leads")
                  .select("status, history")
                  .eq("id", item.leadId)
                  .maybeSingle();
                const hist = Array.isArray(leadAtual?.history)
                  ? (leadAtual!.history as unknown[])
                  : [];
                const novoHist = [
                  ...hist,
                  { ts: Date.now(), text: "Campanha — sem_whatsapp (número não está no WhatsApp)" },
                ];
                await supabaseAdmin
                  .from("leads")
                  .update({ status: "sem_numero", history: novoHist as never })
                  .eq("id", item.leadId);
                if (leadAtual?.status && leadAtual.status !== "sem_numero") {
                  const { logLeadStatusChange } = await import("@/lib/leads-audit.server");
                  await logLeadStatusChange({
                    leadId: item.leadId,
                    userId: c.user_id,
                    statusAnterior: leadAtual.status,
                    statusNovo: "sem_numero",
                    origem: "cron:process-campaigns",
                    detalhes: { campanha_id: c.id, motivo: "numero_sem_whatsapp" },
                  });
                }
                results.skipped++;
              } else {
                results.errors++;
                // Só notifica quando desistimos definitivamente (retry esgotado).
                // Falhas intermediárias ficam no dispatch_log; não spammam o sino.
                if (statusRegistrado === "falha") {
                  const nomeLead =
                    (lead as { nome_empresa?: string } | null)?.nome_empresa ?? item.nome ?? "Lead";
                  await notifyOnce({
                    userId: c.user_id,
                    tipo: "campanha_falha_envio",
                    titulo: `Falha ao enviar mensagem em "${c.nome ?? "campanha"}"`,
                    descricao: `Após ${itemAtual.attempts ?? "várias"} tentativas, não foi possível enviar para ${nomeLead}. Último erro: ${msg.slice(0, 200)}`,
                    link: `/app/campanhas`,
                    dedupeWindowMin: 30,
                  });
                }
              }
              detalhes.push({
                campanhaId: c.id,
                nome: c.nome,
                userId: c.user_id,
                resultado: semWhats
                  ? "sem_whatsapp"
                  : statusRegistrado === "pendente"
                    ? "retry_agendado"
                    : "falha",
                leadId: item.leadId,
                pendentesAntes,
                motivo: msg,
              });
              // segue para o próximo lead no próximo tick
            }
          }
        } catch (e) {
          runOk = false;
          runError = mensagemErro(e);
          console.error("[cron-campaigns] falha inesperada no run:", e);
          // Notifica donos de campanhas ativas — a falha do run afeta os envios deles.
          try {
            const userIdsAfetados = [...new Set(detalhes.map((d) => d.userId).filter(Boolean))];
            for (const uid of userIdsAfetados) {
              await notifyOnce({
                userId: uid,
                tipo: "cron_falha",
                titulo: "Falha ao processar campanhas",
                descricao: `O processador de campanhas encontrou um erro e a execução foi interrompida. Ele tentará novamente no próximo ciclo (~1 min). Detalhe: ${runError?.slice(0, 200) ?? "desconhecido"}`,
                link: `/app/campanhas`,
                dedupeWindowMin: 30,
              });
            }
          } catch (notifyErr) {
            console.error("[cron-campaigns] falha ao notificar erro do run:", notifyErr);
          }
        } finally {
          const finishedAt = new Date();
          try {
            await supabaseAdmin.from("campanha_cron_runs").insert({
              started_at: new Date(runStart).toISOString(),
              finished_at: finishedAt.toISOString(),
              duration_ms: finishedAt.getTime() - runStart,
              campanhas_consideradas: detalhes.length,
              campanhas_iniciadas: results.started,
              leads_selecionados: leadsSelecionados,
              mensagens_enviadas: results.sent,
              concluidas: results.completed,
              pulados: results.skipped,
              erros: results.errors,
              detalhes: detalhes as never,
              ok: runOk,
              error_message: runError,
            });
          } catch (logErr) {
            console.error("[cron-campaigns] falha ao gravar cron_run:", logErr);
          }
        }

        return Response.json({ ok: runOk, ts: new Date().toISOString(), ...results });
      },
    },
  },
});
