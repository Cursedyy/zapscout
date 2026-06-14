/**
 * Cron: executa Prospecção Automática de cada usuário ativo.
 *
 * 1. Busca leads via Apify (nicho + cidade configurados)
 * 2. Calcula score interno e filtra >= score_min
 * 3. Para cada lead novo (não existe em mensagens_enviadas), envia via UAZAPI
 * 4. Respeita limite diário e intervalo entre mensagens
 *
 * Sugerido rodar a cada 5 min: o contador `enviados_hoje` reseta a cada novo dia.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazSendText } from "@/lib/uazapi.server";
import { gateCronHook } from "@/lib/hook-gate.server";

type ApifyPlace = {
  title?: string;
  name?: string;
  address?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string | null;
  totalScore?: number;
  rating?: number;
  reviewsCount?: number;
  user_ratings_total?: number;
  location?: { lat?: number; lng?: number };
  placeId?: string;
};

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
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

// Score interno (0-100) baseado em sinais públicos do Google Maps.
// Quanto MAIS alto, MAIS quente o lead.
function calcularScore(p: ApifyPlace): number {
  const rating = Number(p.totalScore ?? p.rating ?? 0) || 0;
  const reviews = Number(p.reviewsCount ?? p.user_ratings_total ?? 0) || 0;
  const semSite = !p.website ? 30 : 0; // sem site = oportunidade
  const rScore = Math.min(50, rating * 10); // 0-50
  const revScore = Math.min(20, Math.log10(reviews + 1) * 10); // 0-20
  return Math.round(rScore + revScore + semSite);
}

function soDigitos(s: string): string {
  return (s ?? "").replace(/\D+/g, "");
}

async function buscarApify(nicho: string, cidade: string, qtd: number): Promise<ApifyPlace[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN ausente");
  const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchStringsArray: [`${nicho} em ${cidade}`],
      maxCrawledPlacesPerSearch: qtd,
      language: "pt",
    }),
  });
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}`);
  const arr = (await res.json()) as ApifyPlace[];
  return Array.isArray(arr) ? arr : [];
}

export const Route = createFileRoute("/api/public/hooks/process-prospeccao-auto")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-prospeccao-auto");
        if (gate) return gate;

        const hoje = new Date().toISOString().slice(0, 10);
        const nowMs = Date.now();
        const results = {
          configs: 0,
          buscas: 0,
          enviados: 0,
          pulados_score: 0,
          pulados_ja_contatado: 0,
          erros: 0,
          desativados: 0,
        };

        // Pega todas as configs ativas
        const { data: configs } = await supabaseAdmin
          .from("prospeccao_auto_config")
          .select("*")
          .eq("ativo", true)
          .limit(200);

        for (const cfg of configs ?? []) {
          results.configs++;

          // Reset contador diário
          let enviadosHoje = cfg.ultimo_run_data === hoje ? cfg.enviados_hoje : 0;
          if (enviadosHoje >= cfg.limite_diario) continue;

          // Intervalo entre mensagens
          const lastTs = cfg.last_sent_at ? new Date(cfg.last_sent_at).getTime() : 0;
          if (nowMs - lastTs < cfg.intervalo_segundos * 1000) continue;

          // Profile + whatsapp
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("uazapi_instance_token, uazapi_instance_status")
            .eq("id", cfg.user_id)
            .maybeSingle();
          if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "connected") {
            console.warn("[prosp-auto] sem WhatsApp conectado para", cfg.user_id, "— desativando.");
            await supabaseAdmin
              .from("prospeccao_auto_config")
              .update({ ativo: false })
              .eq("user_id", cfg.user_id);
            results.desativados++;
            continue;
          }

          // Template — usa mensagem salva diretamente (templates ficam no localStorage do cliente,
          // não no banco. template_mensagem é persistido na config pelo front.)
          const mensagemTemplate = (cfg as { template_mensagem: string | null }).template_mensagem;
          if (!mensagemTemplate) continue;

          // 1) Busca Apify
          let places: ApifyPlace[] = [];
          try {
            places = await buscarApify(cfg.nicho, cfg.cidade, 30);
            results.buscas++;
          } catch (e) {
            console.error("[prosp-auto] Apify falhou para", cfg.user_id, e);
            results.erros++;
            continue;
          }

          // 2) Score
          const candidatos = places
            .map((p) => ({ p, score: calcularScore(p) }))
            .filter((x) => x.score >= cfg.score_min);
          results.pulados_score += places.length - candidatos.length;

          for (const { p, score } of candidatos) {
            if (enviadosHoje >= cfg.limite_diario) break;

            const numero = soDigitos(p.phone ?? p.phoneUnformatted ?? "");
            if (numero.length < 10) continue;

            // 3) Upsert lead (chave: user_id + telefone)
            const nome_empresa = p.title ?? p.name ?? "Sem nome";
            const { data: leadExistente } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("user_id", cfg.user_id)
              .eq("telefone", numero)
              .maybeSingle();

            let leadId = leadExistente?.id as string | undefined;
            if (!leadId) {
              const { data: novoLead, error: errNovo } = await supabaseAdmin
                .from("leads")
                .insert({
                  user_id: cfg.user_id,
                  nome_empresa,
                  telefone: numero,
                  whatsapp: numero,
                  endereco: p.address ?? "",
                  cidade: cfg.cidade,
                  nicho: cfg.nicho,
                  avaliacao: Number(p.totalScore ?? p.rating ?? 0) || null,
                  total_avaliacoes: Number(p.reviewsCount ?? p.user_ratings_total ?? 0) || 0,
                  tem_site: !!p.website,
                  site_url: p.website ?? null,
                  status: "novo",
                  lead_external_id: p.placeId ?? null,
                })
                .select("id")
                .single();
              if (errNovo || !novoLead) {
                console.error("[prosp-auto] erro inserindo lead:", errNovo);
                results.erros++;
                continue;
              }
              leadId = novoLead.id;
            }

            // 4) Já contatado em QUALQUER campanha/envio?
            const { count: jaContatado } = await supabaseAdmin
              .from("mensagens_enviadas")
              .select("id", { count: "exact", head: true })
              .eq("user_id", cfg.user_id)
              .eq("lead_id", leadId);

            if ((jaContatado ?? 0) > 0) {
              results.pulados_ja_contatado++;
              continue;
            }

            // 5) Renderiza e envia
            const texto = renderVars(mensagemTemplate, {
              nome_empresa,
              cidade: cfg.cidade,
              nicho: cfg.nicho,
              endereco: p.address ?? "",
              avaliacao: Number(p.totalScore ?? p.rating ?? 0) || null,
              telefone: numero,
            });

            try {
              const r = await uazSendText(profile.uazapi_instance_token, numero, texto);
              await supabaseAdmin.from("mensagens_enviadas").insert({
                user_id: cfg.user_id,
                lead_id: leadId,
                texto,
                status: "enviado",
                campanha_id: null,
                uazapi_message_id: r.id ?? null,
              });

              // Atualiza lead
              const { data: leadAtual } = await supabaseAdmin
                .from("leads")
                .select("status, history")
                .eq("id", leadId)
                .maybeSingle();
              const hist = Array.isArray(leadAtual?.history) ? (leadAtual!.history as unknown[]) : [];
              const novoHist = [
                ...hist,
                { ts: Date.now(), text: `Prospecção automática — score ${score}` },
              ];
              await supabaseAdmin
                .from("leads")
                .update({
                  status: leadAtual?.status === "novo" ? "contatado" : leadAtual?.status,
                  history: novoHist as never,
                })
                .eq("id", leadId);

              enviadosHoje++;
              results.enviados++;

              // Persiste contador + last_sent_at após CADA envio (respeita intervalo no próximo tick)
              await supabaseAdmin
                .from("prospeccao_auto_config")
                .update({
                  enviados_hoje: enviadosHoje,
                  ultimo_run_data: hoje,
                  last_sent_at: new Date().toISOString(),
                })
                .eq("user_id", cfg.user_id);

              // Sai do loop deste user — próximo tick continua respeitando intervalo
              break;
            } catch (e) {
              console.error("[prosp-auto] erro no envio:", e);
              await supabaseAdmin.from("mensagens_enviadas").insert({
                user_id: cfg.user_id,
                lead_id: leadId,
                texto,
                status: "falha",
                campanha_id: null,
              });
              results.erros++;
            }
          }

          // Se nenhum envio aconteceu mas a busca rolou, ainda assim grava a data
          if (cfg.ultimo_run_data !== hoje) {
            await supabaseAdmin
              .from("prospeccao_auto_config")
              .update({ enviados_hoje: enviadosHoje, ultimo_run_data: hoje })
              .eq("user_id", cfg.user_id);
          }
        }

        return Response.json({ ok: true, ts: new Date().toISOString(), ...results });
      },
    },
  },
});
