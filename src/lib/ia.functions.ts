import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IaConfig = {
  user_id: string;
  nome_agente: string;
  cargo: string;
  nome_agencia: string;
  tom: "formal" | "amigavel" | "descontraido";
  servicos: string;
  diferenciais: string;
  restricoes: string;
  objetivos: string[];
  mensagens_para_escalar: number;
  horario_modo: "sempre" | "comercial" | "personalizado";
  horario_inicio: string;
  horario_fim: string;
  mensagem_boas_vindas: string;
  ativa: boolean;
  mensagens_mes_count: number;
  mensagens_mes_reset: string;
};

export type IaMensagem = {
  origem: "lead" | "ia" | "user";
  texto: string;
  ts: number;
};

export type IaConversa = {
  id: string;
  user_id: string;
  lead_id: string;
  ia_ativa: boolean;
  status: "ativa" | "escalada" | "encerrada";
  mensagens: IaMensagem[];
  ultima_em: string;
  updated_at: string;
  lead?: {
    id: string;
    nome_empresa: string;
    cidade: string | null;
    nicho: string | null;
    telefone: string | null;
    whatsapp: string | null;
    avaliacao: number | null;
    tem_site: boolean | null;
  };
};

export type IaQA = { id: string; pergunta: string; resposta: string };

export type IaEscalonamento = {
  id: string;
  lead_id: string;
  conversa_id: string;
  motivo: string;
  lida: boolean;
  created_at: string;
};

export const getIaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("ia_config").select("*").eq("user_id", userId).maybeSingle();
    if (data) return data as IaConfig;
    const { data: created, error } = await supabase
      .from("ia_config")
      .insert({ user_id: userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created as IaConfig;
  });

const configInput = z.object({
  nome_agente: z.string().min(1).max(80),
  cargo: z.string().max(120).default(""),
  nome_agencia: z.string().max(120).default(""),
  tom: z.enum(["formal", "amigavel", "descontraido"]),
  servicos: z.string().max(4000).default(""),
  diferenciais: z.string().max(4000).default(""),
  restricoes: z.string().max(4000).default(""),
  objetivos: z.array(z.string()).max(8).default([]),
  mensagens_para_escalar: z.number().int().min(1).max(20),
  horario_modo: z.enum(["sempre", "comercial", "personalizado"]),
  horario_inicio: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  horario_fim: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
  mensagem_boas_vindas: z.string().max(2000).default(""),
  ativa: z.boolean(),
});

export const salvarIaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => configInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("ia_config")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as IaConfig;
  });

export const listarIaQAs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ia_qas")
      .select("id,pergunta,resposta")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as IaQA[];
  });

export const upsertIaQA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        pergunta: z.string().min(1).max(500),
        resposta: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase
        .from("ia_qas")
        .update({ pergunta: data.pergunta, resposta: data.resposta })
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabase
      .from("ia_qas")
      .insert({ user_id: userId, pergunta: data.pergunta, resposta: data.resposta })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deletarIaQA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("ia_qas").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarConversasIa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: convs, error } = await supabase
      .from("ia_conversas")
      .select("*")
      .eq("user_id", userId)
      .order("ultima_em", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (convs ?? []).map((c) => c.lead_id);
    if (!ids.length) return [] as IaConversa[];
    const { data: leads } = await supabase
      .from("leads")
      .select("id,nome_empresa,cidade,nicho,telefone,whatsapp,avaliacao,tem_site")
      .in("id", ids);
    const map = new Map((leads ?? []).map((l) => [l.id, l]));
    return (convs ?? []).map((c) => ({ ...c, lead: map.get(c.lead_id) })) as unknown as IaConversa[];
  });

export const definirIaAtivaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversa_id: z.string().uuid(), ia_ativa: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("ia_conversas")
      .update({ ia_ativa: data.ia_ativa, status: data.ia_ativa ? "ativa" : "escalada" })
      .eq("id", data.conversa_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enviarMensagemManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversa_id: z.string().uuid(), texto: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv } = await supabase
      .from("ia_conversas")
      .select("mensagens")
      .eq("id", data.conversa_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");
    const msgs = [...((conv.mensagens as IaMensagem[]) ?? []), { origem: "user" as const, texto: data.texto, ts: Date.now() }];
    const { error } = await supabase
      .from("ia_conversas")
      .update({ mensagens: msgs, ultima_em: new Date().toISOString() })
      .eq("id", data.conversa_id);
    if (error) throw new Error(error.message);
    // TODO: enviar via UAZAPI quando integrado com webhook real
    return { ok: true };
  });

export const listarEscalonamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ia_escalonamentos")
      .select("*")
      .eq("user_id", userId)
      .eq("lida", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as IaEscalonamento[];
  });

export const marcarEscalonamentoLido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("ia_escalonamentos").update({ lida: true }).eq("id", data.id).eq("user_id", userId);
    return { ok: true };
  });

// ---------- IA principal: processar mensagem recebida ----------

function dentroHorario(cfg: IaConfig): boolean {
  if (cfg.horario_modo === "sempre") return true;
  const now = new Date();
  // Brasília offset -03:00 aproximado (sem DST). Usa horário local do server por simplicidade.
  const hm = now.toTimeString().slice(0, 5);
  const ini = cfg.horario_modo === "comercial" ? "08:00" : cfg.horario_inicio;
  const fim = cfg.horario_modo === "comercial" ? "18:00" : cfg.horario_fim;
  return hm >= ini && hm <= fim;
}

function buildSystemPrompt(cfg: IaConfig, qas: IaQA[], lead: NonNullable<IaConversa["lead"]>): string {
  const tomTxt =
    cfg.tom === "formal"
      ? "formal e profissional"
      : cfg.tom === "descontraido"
        ? "descontraído e informal"
        : "amigável e próximo, use emojis com moderação";
  const objetivos = cfg.objetivos?.join(", ") || "qualificar, tirar dúvidas, agendar";
  const qaTxt = qas.length
    ? `\nRESPOSTAS ESPECÍFICAS TREINADAS:\n${qas.map((q) => `- Se perguntarem sobre "${q.pergunta}", responda: "${q.resposta}"`).join("\n")}\n`
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
- Caso contrário, retorne APENAS o texto da resposta (sem aspas, sem markdown).`;
}

async function chamarLovableAI(
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
    if (res.status === 402) throw new Error("Créditos da IA esgotados. Adicione créditos em Settings → Workspace → Usage.");
    throw new Error(`Erro IA (${res.status})`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function classificarIntencao(ultima: string): Promise<string> {
  try {
    const out = await chamarLovableAI(
      "Você classifica intenção de lead em vendas. Responda UMA palavra apenas.",
      [
        {
          role: "user",
          content: `Com base nesta última resposta:\n"${ultima}"\nClassifique em UMA opção: QUALIFICADO, REUNIAO_AGENDADA, SEM_INTERESSE, EM_ANDAMENTO. Responda APENAS uma dessas palavras.`,
        },
      ],
    );
    return out.toUpperCase().replace(/[^A-Z_]/g, "");
  } catch {
    return "EM_ANDAMENTO";
  }
}

export const processarMensagemLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lead_id: z.string().uuid(), texto: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: cfg } = await supabase.from("ia_config").select("*").eq("user_id", userId).maybeSingle();
    const config = (cfg ?? null) as IaConfig | null;
    if (!config) throw new Error("Configure a IA antes de simular.");

    const { data: lead } = await supabase
      .from("leads")
      .select("id,nome_empresa,cidade,nicho,telefone,whatsapp,avaliacao,tem_site")
      .eq("id", data.lead_id)
      .eq("user_id", userId)
      .single();
    if (!lead) throw new Error("Lead não encontrado");

    const { data: convExistente } = await supabase
      .from("ia_conversas")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_id", data.lead_id)
      .maybeSingle();

    let conversa = (convExistente as unknown) as
      | { id: string; mensagens: IaMensagem[]; ia_ativa: boolean; status: string }
      | null;

    if (!conversa) {
      const { data: nova, error: errIns } = await supabase
        .from("ia_conversas")
        .insert({ user_id: userId, lead_id: data.lead_id, mensagens: [] })
        .select("*")
        .single();
      if (errIns) throw new Error(errIns.message);
      conversa = (nova as unknown) as typeof conversa;
    }
    if (!conversa) throw new Error("Falha ao criar conversa");

    const mensagens: IaMensagem[] = [
      ...(conversa.mensagens ?? []),
      { origem: "lead", texto: data.texto, ts: Date.now() },
    ];

    // Status do lead -> respondeu
    await supabase.from("leads").update({ status: "respondeu" }).eq("id", data.lead_id).eq("user_id", userId);

    if (!config.ativa || !conversa.ia_ativa) {
      await supabase
        .from("ia_conversas")
        .update({ mensagens, ultima_em: new Date().toISOString() })
        .eq("id", conversa.id);
      return { tipo: "ia_inativa" as const };
    }

    if (!dentroHorario(config)) {
      await supabase
        .from("ia_conversas")
        .update({ mensagens, ultima_em: new Date().toISOString() })
        .eq("id", conversa.id);
      return { tipo: "fora_horario" as const };
    }

    const { data: qas } = await supabase
      .from("ia_qas")
      .select("id,pergunta,resposta")
      .eq("user_id", userId);

    const sys = buildSystemPrompt(config, (qas ?? []) as IaQA[], lead);
    const histRoles: { role: "user" | "assistant"; content: string }[] = mensagens.map((m) => ({
      role: m.origem === "lead" ? "user" : "assistant",
      content: m.texto,
    }));

    const respostaBruta = await chamarLovableAI(sys, histRoles);

    // Tenta detectar escalonamento JSON
    let escalar: { escalar: boolean; motivo?: string } | null = null;
    try {
      const j = JSON.parse(respostaBruta);
      if (j && typeof j === "object" && j.escalar) escalar = j;
    } catch {
      /* texto normal */
    }

    if (escalar?.escalar) {
      await supabase
        .from("ia_conversas")
        .update({
          mensagens,
          ia_ativa: false,
          status: "escalada",
          ultima_em: new Date().toISOString(),
        })
        .eq("id", conversa.id);
      await supabase.from("ia_escalonamentos").insert({
        user_id: userId,
        lead_id: data.lead_id,
        conversa_id: conversa.id,
        motivo: escalar.motivo ?? "Lead requer atenção humana",
      });
      return { tipo: "escalada" as const, motivo: escalar.motivo };
    }

    const novasMsgs: IaMensagem[] = [
      ...mensagens,
      { origem: "ia", texto: respostaBruta, ts: Date.now() },
    ];

    await supabase
      .from("ia_conversas")
      .update({ mensagens: novasMsgs, ultima_em: new Date().toISOString() })
      .eq("id", conversa.id);

    // Contador mensal
    await supabase
      .from("ia_config")
      .update({ mensagens_mes_count: (config.mensagens_mes_count ?? 0) + 1 })
      .eq("user_id", userId);

    // Classificação de intenção (best-effort)
    const intencao = await classificarIntencao(respostaBruta);
    if (intencao === "QUALIFICADO" || intencao === "REUNIAO_AGENDADA") {
      await supabase.from("leads").update({ status: "negociacao" }).eq("id", data.lead_id).eq("user_id", userId);
    } else if (intencao === "SEM_INTERESSE") {
      await supabase.from("leads").update({ status: "perdido" }).eq("id", data.lead_id).eq("user_id", userId);
    }

    // TODO: enviar resposta via UAZAPI (uazSendText) quando integração com webhook real estiver ativa
    return { tipo: "ok" as const, resposta: respostaBruta, intencao };
  });
