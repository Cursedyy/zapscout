/**
 * Lógica server-only da IA de Vendas — pode ser chamada tanto por serverFn
 * autenticado quanto pelo webhook UAZAPI (admin client).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IaConfig, IaMensagem, IaQA } from "./ia.functions";
import { resolveTokenParaConversa } from "./uazapi-resolve.server";

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

// Perguntas de preço nunca são respondidas pela IA — trava dura, independente
// do que o LLM decidir (defesa em profundidade além da instrução no prompt).
const REGEX_PERGUNTA_PRECO =
  /pre[çc]o|valor(es)?|quanto (custa|é|fica|sai|cobra)|mensalidade|investimento|or[çc]amento/i;
const RESPOSTA_PADRAO_PRECO = "Vou verificar a melhor condição pra você e já te retorno! 😊";

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
Fale em português brasileiro, tom ${tomTxt}. Nunca diga que é uma IA.

ESTILO OBRIGATÓRIO:
- Mensagens curtas: 2 a 4 linhas, no máximo.
- Sem markdown (sem *, #, listas, links formatados).
- No máximo 1 emoji, e só se fizer sentido.
- Nunca soe como robô ou script decorado.
- Sempre termine com uma pergunta ou um próximo passo claro.

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

ESCALE PARA HUMANO quando:
- Perguntarem preço/valor — NUNCA informe valores. Diga que vai verificar a melhor condição e retornar.
- O lead ficar muito quente: aceitar ver uma demonstração, pedir reunião/call, ou pedir para fechar/contratar agora.
- Pedirem para falar com o responsável, ou fizerem pergunta técnica muito específica.
- Passarem de ${cfg.mensagens_para_escalar} mensagens sem avanço.

FORMATO OBRIGATÓRIO DA RESPOSTA — retorne APENAS este JSON (sem markdown, sem \`\`\`):
{"resposta":"texto curto para o lead","intencao":"EM_ANDAMENTO","escalar":false}

Valores de "intencao": EM_ANDAMENTO | QUALIFICADO | REUNIAO_AGENDADA | SEM_INTERESSE
Se for escalar, use: {"resposta":"mensagem curta que avisa o lead que um humano vai continuar","intencao":"EM_ANDAMENTO","escalar":true,"motivo":"por que escalar"}`;
}

/** Usado por campanha-ia.functions.ts (geração de variantes de mensagem) — fora do escopo do motor conversacional. */
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
    if (res.status === 429)
      throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos da IA esgotados.");
    throw new Error(`Erro IA (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function chamarClaude(
  systemPrompt: string,
  mensagens: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: mensagens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429)
      throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
    if (res.status === 402 || res.status === 529)
      throw new Error("IA indisponível no momento. Tente novamente em instantes.");
    throw new Error(`Erro IA (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === "text");
  return (textBlock?.text ?? "").trim();
}

type ParsedIA = {
  resposta: string;
  intencao: string;
  escalar: boolean;
  motivo?: string;
};

function parseRespostaIA(bruto: string): ParsedIA {
  // Extrai JSON de qualquer lugar do texto (aceita ```json ... ``` ou JSON solto)
  const semFence = bruto
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const ini = semFence.indexOf("{");
  const fim = semFence.lastIndexOf("}");
  if (ini !== -1 && fim > ini) {
    const bloco = semFence.slice(ini, fim + 1);
    try {
      const j = JSON.parse(bloco) as Record<string, unknown>;
      const resposta =
        typeof j.resposta === "string" && j.resposta.trim() ? j.resposta.trim() : semFence;
      const intencaoRaw = typeof j.intencao === "string" ? j.intencao.toUpperCase() : "";
      const intencao = [
        "EM_ANDAMENTO",
        "QUALIFICADO",
        "REUNIAO_AGENDADA",
        "SEM_INTERESSE",
      ].includes(intencaoRaw)
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
 *
 * `instanciaId` identifica qual instância UazAPI recebeu a mensagem (null =
 * instância principal) — persistido na conversa pra responder pelo número certo.
 */
export async function processarMensagemNucleo(
  db: SupabaseClient,
  userId: string,
  leadId: string,
  texto: string,
  instanciaId: string | null = null,
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

  let conversa = convExistente as unknown as {
    id: string;
    mensagens: IaMensagem[];
    ia_ativa: boolean;
    status: string;
    uazapi_instancia_id: string | null;
  } | null;

  if (!conversa) {
    const { data: nova, error: errIns } = await db
      .from("ia_conversas")
      .insert({ user_id: userId, lead_id: leadId, mensagens: [], uazapi_instancia_id: instanciaId })
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
  if (statusAtual !== "respondeu") {
    const { logLeadStatusChange } = await import("@/lib/leads-audit.server");
    await logLeadStatusChange({
      leadId,
      userId,
      statusAnterior: statusAtual,
      statusNovo: "respondeu",
      origem: "ia-vendas",
      detalhes: { motivo: "lead respondeu no whatsapp" },
    });
  }

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

  const { data: qas } = await db
    .from("ia_qas")
    .select("id,pergunta,resposta")
    .eq("user_id", userId);

  const sys = buildSystemPrompt(config, (qas ?? []) as IaQA[], lead as Lead);
  const histRoles: { role: "user" | "assistant"; content: string }[] = mensagens.map((m) => ({
    role: m.origem === "lead" ? "user" : "assistant",
    content: m.texto,
  }));

  const respostaBruta = await chamarClaude(sys, histRoles);
  const parsed = parseRespostaIA(respostaBruta);

  // Trava dura: se o lead perguntou preço, a resposta e a decisão de escalar
  // NÃO dependem do LLM ter seguido a instrução — força aqui.
  if (REGEX_PERGUNTA_PRECO.test(texto)) {
    parsed.resposta = RESPOSTA_PADRAO_PRECO;
    parsed.escalar = true;
    parsed.motivo = "Lead perguntou preço";
  }

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

  let novoStatusIA: "negociacao" | "perdido" | null = null;
  if (parsed.intencao === "QUALIFICADO" || parsed.intencao === "REUNIAO_AGENDADA") {
    novoStatusIA = "negociacao";
  } else if (parsed.intencao === "SEM_INTERESSE") {
    novoStatusIA = "perdido";
  }
  if (novoStatusIA) {
    await db.from("leads").update({ status: novoStatusIA }).eq("id", leadId).eq("user_id", userId);
    // statusAtual pode já ter virado "respondeu" acima; usamos "respondeu" como
    // referência (foi o último valor gravado nesta execução).
    const anterior = statusAtual === "respondeu" ? "respondeu" : "respondeu";
    const { logLeadStatusChange } = await import("@/lib/leads-audit.server");
    await logLeadStatusChange({
      leadId,
      userId,
      statusAnterior: anterior,
      statusNovo: novoStatusIA,
      origem: "ia-vendas",
      detalhes: { intencao: parsed.intencao, conversa_id: conversa.id },
    });
  }

  return { tipo: "ok", resposta: parsed.resposta, intencao: parsed.intencao };
}

/**
 * Wrapper para o webhook: processa a mensagem E envia a resposta via UAZAPI
 * (pela instância certa — principal ou extra). Se escalar, também alerta o
 * dono no WhatsApp pessoal configurado em ia_config.telefone_alerta.
 * Retorna o resultado do processamento (o envio é best-effort e logado).
 */
export async function processarMensagemAdmin(
  userId: string,
  leadId: string,
  texto: string,
  instanciaId: string | null = null,
): Promise<ProcessarResultado> {
  const db = supabaseAdmin as unknown as SupabaseClient;
  const resultado = await processarMensagemNucleo(db, userId, leadId, texto, instanciaId);

  // Só envia se a IA gerou resposta (ok ou escalada com mensagem de despedida)
  const respostaEnviar =
    resultado.tipo === "ok"
      ? resultado.resposta
      : resultado.tipo === "escalada" && resultado.resposta
        ? resultado.resposta
        : null;

  if (!respostaEnviar) return resultado;

  let leadInfo: {
    whatsapp: string | null;
    telefone: string | null;
    nome_empresa: string | null;
  } | null = null;
  try {
    const [{ data: lead }, token] = await Promise.all([
      db.from("leads").select("whatsapp,telefone,nome_empresa").eq("id", leadId).maybeSingle(),
      resolveTokenParaConversa(userId, instanciaId),
    ]);
    leadInfo = lead ?? null;
    const numero = lead?.whatsapp || lead?.telefone;
    if (!numero) {
      console.warn("[ia] lead sem número, não envia:", leadId);
      return resultado;
    }
    if (!token) {
      console.warn("[ia] whatsapp desconectado, não envia:", userId);
      return resultado;
    }
    const { uazSendText } = await import("./uazapi.server");
    const r = await uazSendText(token, numero, respostaEnviar);
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

  if (resultado.tipo === "escalada") {
    try {
      const { data: cfg } = await db
        .from("ia_config")
        .select("telefone_alerta")
        .eq("user_id", userId)
        .maybeSingle();
      const telefoneAlerta = (cfg as { telefone_alerta?: string | null } | null)?.telefone_alerta;
      const token = await resolveTokenParaConversa(userId, instanciaId);
      if (telefoneAlerta && token) {
        const nome = leadInfo?.nome_empresa ?? "Lead";
        const contato = leadInfo?.whatsapp || leadInfo?.telefone || "sem número";
        const alerta =
          `⚠️ ${nome} (${contato}) precisa de você.\n` +
          `Motivo: ${resultado.motivo ?? "atenção necessária"}\n` +
          `Última mensagem do lead: "${texto}"`;
        const { uazSendText } = await import("./uazapi.server");
        await uazSendText(token, telefoneAlerta, alerta);
      }
    } catch (err) {
      console.error("[ia] falha ao enviar alerta de escalonamento:", err);
    }
  }

  return resultado;
}
