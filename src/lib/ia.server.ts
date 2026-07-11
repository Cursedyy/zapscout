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
        ? "descontraído e informal, pode usar gírias leves"
        : "amigável e próximo, pode usar emojis com moderação";
  const objetivos = cfg.objetivos?.join(", ") || "qualificar o lead e agendar uma conversa";
  const qaTxt = qas.length
    ? `\nRESPOSTAS TREINADAS (use quando fizer sentido):\n${qas
        .map((q) => `• Pergunta similar a "${q.pergunta}" → responda: "${q.resposta}"`)
        .join("\n")}\n`
    : "";

  return `Você é ${cfg.nome_agente}, ${cfg.cargo}${cfg.nome_agencia ? ` da ${cfg.nome_agencia}` : ""}.
Fale em português brasileiro, tom ${tomTxt}. Máximo 3 frases por mensagem. Nunca diga que é uma IA.

SEU NEGÓCIO:
${cfg.servicos || "(sem descrição de serviços)"}

DIFERENCIAIS: ${cfg.diferenciais || "(não informado)"}
NÃO FAÇA: ${cfg.restricoes || "(nenhuma restrição)"}
OBJETIVO: ${objetivos}.
${qaTxt}
LEAD ATUAL:
- Empresa: ${lead.nome_empresa}
- Cidade: ${lead.cidade ?? "-"}
- Nicho: ${lead.nicho ?? "-"}
- Tem site: ${lead.tem_site ? "sim" : "não"}
- Avaliação Google: ${lead.avaliacao ?? "-"}

ESCALE PARA HUMANO quando: pedirem para falar com responsável, quiserem fechar/pagar agora, fizerem pergunta técnica muito específica, ou depois de ${cfg.mensagens_para_escalar} mensagens sem avanço.

FORMATO OBRIGATÓRIO DA RESPOSTA — retorne APENAS este JSON (sem markdown, sem \`\`\`):
{"resposta":"texto curto para o lead","intencao":"EM_ANDAMENTO","escalar":false}

Valores de "intencao": EM_ANDAMENTO | QUALIFICADO | REUNIAO_AGENDADA | SEM_INTERESSE
Se for escalar, use: {"resposta":"mensagem curta que avisa o lead que um humano vai continuar","intencao":"EM_ANDAMENTO","escalar":true,"motivo":"por que escalar"}`;
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
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }, ...mensagens],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos da IA esgotados.");
    throw new Error(`Erro IA (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

type ParsedIA = {
  resposta: string;
  intencao: string;
  escalar: boolean;
  motivo?: string;
};

function parseRespostaIA(bruto: string): ParsedIA {
  // Extrai JSON de qualquer lugar do texto (aceita ```json ... ``` ou JSON solto)
  const semFence = bruto.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const ini = semFence.indexOf("{");
  const fim = semFence.lastIndexOf("}");
  if (ini !== -1 && fim > ini) {
    const bloco = semFence.slice(ini, fim + 1);
    try {
      const j = JSON.parse(bloco) as Record<string, unknown>;
      const resposta =
        typeof j.resposta === "string" && j.resposta.trim()
          ? j.resposta.trim()
          : semFence;
      const intencaoRaw = typeof j.intencao === "string" ? j.intencao.toUpperCase() : "";
      const intencao = ["EM_ANDAMENTO", "QUALIFICADO", "REUNIAO_AGENDADA", "SEM_INTERESSE"].includes(
        intencaoRaw,
      )
        ? intencaoRaw
        : "EM_ANDAMENTO";
      return {
        resposta,
        intencao,
        escalar: j.escalar === true,
        motivo: typeof j.motivo === "string" ? j.motivo : undefined,
      };
    } catch {
      /* cai no fallback */
    }
  }
  // Fallback: trata a resposta bruta (sem JSON) como texto para o lead
  return { resposta: bruto || "Desculpe, pode repetir?", intencao: "EM_ANDAMENTO", escalar: false };
}

export type ProcessarResultado =
  | { tipo: "ia_inativa" }
  | { tipo: "fora_horario" }
  | { tipo: "escalada"; resposta?: string; motivo?: string }
  | { tipo: "ok"; resposta: string; intencao: string };

/**
 * Núcleo: processa uma mensagem de lead e gera resposta da IA (ou escala).
 * Aceita um client específico (autenticado ou admin) — RLS aplica conforme o client.
 * NÃO envia via WhatsApp; o caller decide (webhook envia, simulação da UI não).
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
    .select("id,nome_empresa,cidade,nicho,telefone,whatsapp,avaliacao,tem_site,status")
    .eq("id", leadId)
    .eq("user_id", userId)
    .single();
  if (!lead) throw new Error("Lead não encontrado");
  const statusAtual = (lead as { status?: string }).status ?? null;

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

  const novasMsgs: IaMensagem[] = [
    ...mensagens,
    { origem: "ia", texto: parsed.resposta, ts: Date.now() },
  ];

  if (parsed.escalar) {
    await db
      .from("ia_conversas")
      .update({
        mensagens: novasMsgs,
        ia_ativa: false,
        status: "escalada",
        ultima_em: new Date().toISOString(),
      })
      .eq("id", conversa.id);
    await db.from("ia_escalonamentos").insert({
      user_id: userId,
      lead_id: leadId,
      conversa_id: conversa.id,
      motivo: parsed.motivo ?? "Lead requer atenção humana",
    });
    await db
      .from("ia_config")
      .update({ mensagens_mes_count: (config.mensagens_mes_count ?? 0) + 1 })
      .eq("user_id", userId);
    return { tipo: "escalada", resposta: parsed.resposta, motivo: parsed.motivo };
  }

  await db
    .from("ia_conversas")
    .update({ mensagens: novasMsgs, ultima_em: new Date().toISOString() })
    .eq("id", conversa.id);

  await db
    .from("ia_config")
    .update({ mensagens_mes_count: (config.mensagens_mes_count ?? 0) + 1 })
    .eq("user_id", userId);

  if (parsed.intencao === "QUALIFICADO" || parsed.intencao === "REUNIAO_AGENDADA") {
    await db.from("leads").update({ status: "negociacao" }).eq("id", leadId).eq("user_id", userId);
  } else if (parsed.intencao === "SEM_INTERESSE") {
    await db.from("leads").update({ status: "perdido" }).eq("id", leadId).eq("user_id", userId);
  }

  return { tipo: "ok", resposta: parsed.resposta, intencao: parsed.intencao };
}

/**
 * Wrapper para o webhook: processa a mensagem E envia a resposta via UAZAPI.
 * Retorna o resultado do processamento (o envio é best-effort e logado).
 */
export async function processarMensagemAdmin(
  userId: string,
  leadId: string,
  texto: string,
): Promise<ProcessarResultado> {
  const db = supabaseAdmin as unknown as SupabaseClient;
  const resultado = await processarMensagemNucleo(db, userId, leadId, texto);

  // Só envia se a IA gerou resposta (ok ou escalada com mensagem de despedida)
  const respostaEnviar =
    resultado.tipo === "ok"
      ? resultado.resposta
      : resultado.tipo === "escalada" && resultado.resposta
        ? resultado.resposta
        : null;

  if (!respostaEnviar) return resultado;

  try {
    const [{ data: lead }, { data: profile }] = await Promise.all([
      db.from("leads").select("whatsapp,telefone").eq("id", leadId).maybeSingle(),
      db
        .from("profiles")
        .select("uazapi_instance_token,uazapi_instance_status")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const numero = lead?.whatsapp || lead?.telefone;
    if (!numero) {
      console.warn("[ia] lead sem número, não envia:", leadId);
      return resultado;
    }
    if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "conectado") {
      console.warn("[ia] whatsapp desconectado, não envia:", userId);
      return resultado;
    }
    const { uazSendText } = await import("./uazapi.server");
    const r = await uazSendText(profile.uazapi_instance_token, numero, respostaEnviar);
    await db.from("mensagens_enviadas").insert({
      user_id: userId,
      lead_id: leadId,
      texto: respostaEnviar,
      uazapi_message_id: r.id,
      status: "enviado",
    });
  } catch (err) {
    console.error("[ia] falha ao enviar resposta via WhatsApp:", err);
  }

  return resultado;
}
