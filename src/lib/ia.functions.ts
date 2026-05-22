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
      .select("mensagens, lead_id")
      .eq("id", data.conversa_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada");

    // Busca telefone do lead + token UAZAPI do usuário
    const [{ data: lead }, { data: profile }] = await Promise.all([
      supabase
        .from("leads")
        .select("whatsapp,telefone")
        .eq("id", conv.lead_id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("uazapi_instance_token,uazapi_instance_status")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    const numero = lead?.whatsapp || lead?.telefone;
    let envioErro: string | null = null;
    let uazId: string | undefined;

    if (!numero) {
      envioErro = "Lead sem número de WhatsApp/telefone cadastrado";
    } else if (!profile?.uazapi_instance_token || profile.uazapi_instance_status !== "conectado") {
      envioErro = "WhatsApp não está conectado. Conecte em Configurações > WhatsApp.";
    } else {
      try {
        const { uazSendText } = await import("./uazapi.server");
        const r = await uazSendText(profile.uazapi_instance_token, numero, data.texto);
        uazId = r.id;
      } catch (e) {
        envioErro = e instanceof Error ? e.message : "Falha ao enviar via WhatsApp";
      }
    }

    const msgs = [
      ...((conv.mensagens as IaMensagem[]) ?? []),
      { origem: "user" as const, texto: data.texto, ts: Date.now() },
    ];
    const { error } = await supabase
      .from("ia_conversas")
      .update({ mensagens: msgs, ultima_em: new Date().toISOString() })
      .eq("id", data.conversa_id);
    if (error) throw new Error(error.message);

    // Registra também em mensagens_enviadas se envio teve sucesso
    if (!envioErro && numero) {
      await supabase.from("mensagens_enviadas").insert({
        user_id: userId,
        lead_id: conv.lead_id,
        texto: data.texto,
        uazapi_message_id: uazId,
        status: "enviado",
      });
    }

    if (envioErro) throw new Error(envioErro);
    return { ok: true, uazapi_message_id: uazId };
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

export const processarMensagemLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lead_id: z.string().uuid(), texto: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { processarMensagemNucleo } = await import("./ia.server");
    return processarMensagemNucleo(context.supabase, context.userId, data.lead_id, data.texto);
  });

