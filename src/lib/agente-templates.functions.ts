import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { IaConfig } from "@/lib/ia.functions";

export type AgenteTemplate = {
  id: string;
  nome: string;
  nicho: string;
  nome_agente: string;
  cargo: string;
  nome_agencia: string;
  tom: IaConfig["tom"];
  servicos: string;
  diferenciais: string;
  restricoes: string;
  objetivos: string[];
  mensagens_para_escalar: number;
  horario_modo: IaConfig["horario_modo"];
  horario_inicio: string;
  horario_fim: string;
  mensagem_boas_vindas: string;
};

const COLUNAS =
  "id,nome,nicho,nome_agente,cargo,nome_agencia,tom,servicos,diferenciais,restricoes,objetivos,mensagens_para_escalar,horario_modo,horario_inicio,horario_fim,mensagem_boas_vindas";

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1).max(120),
  nicho: z.string().max(120).default(""),
  nome_agente: z.string().max(120).default(""),
  cargo: z.string().max(120).default(""),
  nome_agencia: z.string().max(120).default(""),
  tom: z.enum(["formal", "amigavel", "descontraido"]).default("amigavel"),
  servicos: z.string().max(4000).default(""),
  diferenciais: z.string().max(4000).default(""),
  restricoes: z.string().max(4000).default(""),
  objetivos: z.array(z.string().max(500)).default([]),
  mensagens_para_escalar: z.number().int().min(1).max(50).default(3),
  horario_modo: z.enum(["sempre", "comercial", "personalizado"]).default("sempre"),
  horario_inicio: z.string().max(10).default("08:00"),
  horario_fim: z.string().max(10).default("18:00"),
  mensagem_boas_vindas: z.string().max(2000).default(""),
});

function normalizar(row: Record<string, unknown>): AgenteTemplate {
  return {
    ...(row as AgenteTemplate),
    objetivos: Array.isArray(row.objetivos) ? (row.objetivos as string[]) : [],
  };
}

export const listarAgenteTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("agente_templates")
      .select(COLUNAS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => normalizar(r as Record<string, unknown>));
  });

/** Lista enxuta usada no seletor "Aplicar modelo". */
export const listarAgenteTemplatesParaAplicar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("agente_templates")
      .select("id,nome,nicho")
      .eq("user_id", userId)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; nome: string; nicho: string }>;
  });

/** Retorna só os campos aplicáveis à config do agente. */
export const obterAgenteTemplateParaAplicar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("agente_templates")
      .select(COLUNAS)
      .eq("user_id", userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Modelo não encontrado");
    const t = normalizar(row as Record<string, unknown>);
    return {
      nome_agente: t.nome_agente,
      cargo: t.cargo,
      nome_agencia: t.nome_agencia,
      tom: t.tom,
      servicos: t.servicos,
      diferenciais: t.diferenciais,
      restricoes: t.restricoes,
      objetivos: t.objetivos,
      mensagens_para_escalar: t.mensagens_para_escalar,
      horario_modo: t.horario_modo,
      horario_inicio: t.horario_inicio,
      horario_fim: t.horario_fim,
      mensagem_boas_vindas: t.mensagem_boas_vindas,
    };
  });

export const salvarAgenteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => templateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...campos } = data;
    if (id) {
      const { error } = await supabase
        .from("agente_templates")
        .update({ ...campos, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabase
      .from("agente_templates")
      .insert({ ...campos, user_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deletarAgenteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("agente_templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
