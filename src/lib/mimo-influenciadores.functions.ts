import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CAMPANHA_INFLUENCIADORES,
  editarInfluenciadorSchema,
  podeGerenciarInfluenciadores,
} from "./mimo-influenciadores";
import type { InfluenciadoresDB } from "./mimo-influenciadores-db";

export const listarInfluenciadoresMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarInfluenciadores(acesso.papel)) throw new Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<InfluenciadoresDB>;
    // Read all pages: Supabase's default row cap must never silently truncate the selection.
    const linhas = [];
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await db
        .from("mimo_influenciadores")
        .select("*")
        .eq("empresa_id", acesso.empresaId)
        .eq("campanha", CAMPANHA_INFLUENCIADORES)
        .order("created_at", { ascending: false })
        .order("id")
        .range(inicio, inicio + 499);
      if (error)
        throw new Error(
          "Não foi possível carregar as inscrições. Verifique a ativação do cadastro e tente novamente.",
        );
      linhas.push(...data);
      if (data.length < 500) break;
    }
    return linhas;
  });
export const editarInfluenciadorMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => editarInfluenciadorSchema.parse(v))
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarInfluenciadores(acesso.papel)) throw new Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<InfluenciadoresDB>;
    const { data: salvo, error } = await db
      .from("mimo_influenciadores")
      .update({ etapa: data.etapa, notas: data.notas })
      .eq("empresa_id", acesso.empresaId)
      .eq("campanha", CAMPANHA_INFLUENCIADORES)
      .eq("id", data.id)
      .eq("versao", data.versao)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível salvar a avaliação.");
    if (!salvo) throw new Error("Este cadastro mudou. Atualize a lista e reabra antes de salvar.");
    return salvo;
  });
export const historicoInfluenciadorMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.string().uuid().parse(v))
  .handler(async ({ context, data: id }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarInfluenciadores(acesso.papel)) throw new Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<InfluenciadoresDB>;
    const { data, error } = await db
      .from("mimo_influenciadores_historico")
      .select("id,etapa,notas,created_at")
      .eq("empresa_id", acesso.empresaId)
      .eq("influenciador_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Não foi possível carregar o histórico.");
    return data;
  });
