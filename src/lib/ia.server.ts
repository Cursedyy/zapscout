/**
 * Lógica server-only da IA de Vendas — pode ser chamada tanto por serverFn
 * autenticado quanto pelo webhook UAZAPI (admin client).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IaConfig, IaMensagem, IaQA } from "./ia.functions";

type Lead = {
  id: string;
  nome_empresa: string;
  cidade: string | null;
  nicho: string | null;
  telefone: string | null;
  whatsapp: string | null;
  avaliacao: number | null;
  tem_site: boolean | null;
};

function dentroHorario(cfg: IaConfig): boolean {
  if (cfg.horario_modo === "sempre") return true;
  const now = new Date();
  const hm = now.toTimeString().slice(0, 5);
  const ini = cfg.horario_modo === "comercial" ? "08:00" : cfg.horario_inicio;
  const fim = cfg.horario_modo === "comercial" ? "18:00" : cfg.horario_fim;
  return hm >= ini && hm <= fim;
}

function buildSystemPrompt(cfg: IaConfig, qas: IaQA[], lead: Lead): string {
  const tomTxt =
    cfg.tom === "formal"
      ? "formal e profissional"
      : cfg.tom === "descontraido"
        ? "descontraído e informal"
        : "amigável e próximo, use emojis com moderação";
  const objetivos = cfg.objetivos?.join(", ") || "qualificar, tirar dúvidas, agendar";
  const qaTxt = qas.length
    ? `\nRESPOSTAS ESPECÍFICAS TREINADAS:\n${qas
        .map((q) => `- Se perguntarem sobre "${q.pergunta}", responda: "${q.resposta}"`)
        .join("\n")}\n`
    : "";
  return `Você é ${cfg.nome_agente}, ${cfg.cargo} da ${cfg.nome_agencia}.

CONTEXTO DOS SERVIÇOS:
${cfg.servicos || "(não informado)"}

DIFERENCIAIS:
${cfg.diferenciais || "(não informado)"}

RESTRIÇÕES — nunca faça isso:
${cfg.restricoes || "(nenhuma)"}

OBJETIVO DA CONVERSA: ${objetivos}.
Seja ${tomTxt}.

INFORMAÇÕES SOBRE ESTE LEAD:
- Nome do negócio: ${lead.nome_empresa}
- Cidade: ${lead.cidade ?? "-"}
- Nicho: ${lead.nicho ?? "-"}
- Avaliação no Google: ${lead.avaliacao ?? "-"}
- Tem site: ${lead.tem_site ? "Sim" : "Não"}
${qaTxt}
REGRAS:
- Seja conciso (máximo 3 frases por mensagem).
- Nunca diga que é uma IA a menos que perguntem diretamente.
- Português brasileiro informal.
- Se o lead pedir para falar com o responsável, quiser fechar contrato agora, fizer pergunta técnica fora do contexto, ou após ${cfg.mensagens_para_escalar} mensagens sem qualificar, retorne APENAS um JSON: {"escalar": true, "motivo": "..."}
- Caso contrário, retorne APENAS um JSON: {"resposta": "texto", "intencao": "QUALIFICADO" | "REUNIAO_AGENDADA" | "SEM_INTERESSE" | "EM_ANDAMENTO"}
- NÃO use markdown nem code fences. Apenas JSON puro.`;
}

export async function chamarLovableAI(
  systemPrompt: string,
  mensagens: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: systemPrompt }, ...mensagens],
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos da IA esgotados.");
    throw new Error(`Erro IA (${res.status})`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

function parseRespostaIA(bruto: string): {
  escalar?: { motivo?: string };
  resposta?: string;
  intencao?: string;
} {
  // Remove eventuais code fences ```json ... ```
  const limpo = bruto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const j = JSON.parse(limpo);
    if (j && typeof j === "object") {
      if (j.escalar) return { escalar: { motivo: j.motivo } };
      if (typeof j.resposta === "string") {
        const int = typeof j.intencao === "string"
          ? j.intencao.toUpperCase().replace(/[^A-Z_]/g, "")
          : "EM_ANDAMENTO";
        return { resposta: j.resposta, intencao: int };
      }
    }
  } catch {
    /* fallback: trata como texto puro */
  }
  return { resposta: bruto, intencao: "EM_ANDAMENTO" };
}

export type ProcessarResultado =
  | { tipo: "ia_inativa" }
  | { tipo: "fora_horario" }
  | { tipo: "escalada"; motivo?: string }
  | { tipo: "ok"; resposta: string; intencao: string };

/**
 * Núcleo: processa uma mensagem de lead e gera resposta da IA (ou escala).
 * Aceita um client específico (autenticado ou admin) — RLS aplica conforme o client.
 */
export async function processarMensagemNucleo(
  db: SupabaseClient,
  userId: string,
  leadId: string,
  texto: string,
): Promise<ProcessarResultado> {
  const { data: cfg } = await db.from("ia_config").select("*").eq("user_id", userId).maybeSingle();
  let config = (cfg ?? null) as IaConfig | null;
  if (!config) throw new Error("Configure a IA antes de simular.");

  // Reset mensal automático do contador
  if (config.mensagens_mes_reset && new Date(config.mensagens_mes_reset).getTime() <= Date.now()) {
    const proxReset = new Date();
    proxReset.setMonth(proxReset.getMonth() + 1, 1);
    proxReset.setHours(0, 0, 0, 0);
    await db
      .from("ia_config")
      .update({ mensagens_mes_count: 0, mensagens_mes_reset: proxReset.toISOString() })
      .eq("user_id", userId);
    config = { ...config, mensagens_mes_count: 0, mensagens_mes_reset: proxReset.toISOString() };
  }

  const { data: lead } = await db
    .from("leads")
    .select("id,nome_empresa,cidade,nicho,telefone,whatsapp,avaliacao,tem_site")
    .eq("id", leadId)
    .eq("user_id", userId)
    .single();
  if (!lead) throw new Error("Lead não encontrado");

  const { data: convExistente } = await db
    .from("ia_conversas")
    .select("*")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .maybeSingle();

  let conversa = convExistente as unknown as
    | { id: string; mensagens: IaMensagem[]; ia_ativa: boolean; status: string }
    | null;

  if (!conversa) {
    const { data: nova, error: errIns } = await db
      .from("ia_conversas")
      .insert({ user_id: userId, lead_id: leadId, mensagens: [] })
      .select("*")
      .single();
    if (errIns) throw new Error(errIns.message);
    conversa = nova as unknown as typeof conversa;
  }
  if (!conversa) throw new Error("Falha ao criar conversa");

  const mensagens: IaMensagem[] = [
    ...(conversa.mensagens ?? []),
    { origem: "lead", texto, ts: Date.now() },
  ];

  await db.from("leads").update({ status: "respondeu" }).eq("id", leadId).eq("user_id", userId);

  if (!config.ativa || !conversa.ia_ativa) {
    await db
      .from("ia_conversas")
      .update({ mensagens, ultima_em: new Date().toISOString() })
      .eq("id", conversa.id);
    return { tipo: "ia_inativa" };
  }

  if (!dentroHorario(config)) {
    await db
      .from("ia_conversas")
      .update({ mensagens, ultima_em: new Date().toISOString() })
      .eq("id", conversa.id);
    return { tipo: "fora_horario" };
  }

  const { data: qas } = await db.from("ia_qas").select("id,pergunta,resposta").eq("user_id", userId);

  const sys = buildSystemPrompt(config, (qas ?? []) as IaQA[], lead as Lead);
  const histRoles: { role: "user" | "assistant"; content: string }[] = mensagens.map((m) => ({
    role: m.origem === "lead" ? "user" : "assistant",
    content: m.texto,
  }));

  const respostaBruta = await chamarLovableAI(sys, histRoles);
  const parsed = parseRespostaIA(respostaBruta);

  if (parsed.escalar) {
    await db
      .from("ia_conversas")
      .update({
        mensagens,
        ia_ativa: false,
        status: "escalada",
        ultima_em: new Date().toISOString(),
      })
      .eq("id", conversa.id);
    await db.from("ia_escalonamentos").insert({
      user_id: userId,
      lead_id: leadId,
      conversa_id: conversa.id,
      motivo: parsed.escalar.motivo ?? "Lead requer atenção humana",
    });
    return { tipo: "escalada", motivo: parsed.escalar.motivo };
  }

  const respostaFinal = parsed.resposta ?? respostaBruta;
  const intencao = parsed.intencao ?? "EM_ANDAMENTO";

  const novasMsgs: IaMensagem[] = [
    ...mensagens,
    { origem: "ia", texto: respostaFinal, ts: Date.now() },
  ];

  await db
    .from("ia_conversas")
    .update({ mensagens: novasMsgs, ultima_em: new Date().toISOString() })
    .eq("id", conversa.id);

  await db
    .from("ia_config")
    .update({ mensagens_mes_count: (config.mensagens_mes_count ?? 0) + 1 })
    .eq("user_id", userId);

  if (intencao === "QUALIFICADO" || intencao === "REUNIAO_AGENDADA") {
    await db.from("leads").update({ status: "negociacao" }).eq("id", leadId).eq("user_id", userId);
  } else if (intencao === "SEM_INTERESSE") {
    await db.from("leads").update({ status: "perdido" }).eq("id", leadId).eq("user_id", userId);
  }

  return { tipo: "ok", resposta: respostaFinal, intencao };
}

/** Wrapper para uso a partir do webhook (admin client, bypass RLS). */
export async function processarMensagemAdmin(
  userId: string,
  leadId: string,
  texto: string,
): Promise<ProcessarResultado> {
  return processarMensagemNucleo(
    supabaseAdmin as unknown as SupabaseClient,
    userId,
    leadId,
    texto,
  );
}
