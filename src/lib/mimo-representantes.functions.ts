import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { editarRepresentanteSchema, podeGerenciarRepresentantes } from "./mimo-representantes";
import type { RepresentantesDB } from "./mimo-representantes-db";
export const listarRepresentantesMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarRepresentantes(a.papel)) throw Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<RepresentantesDB>;
    const rows = [];
    for (let n = 0; ; n += 500) {
      const { data, error } = await db
        .from("mimo_representantes")
        .select("*")
        .eq("empresa_id", a.empresaId)
        .is("excluido_em", null)
        .order("created_at", { ascending: false })
        .order("id")
        .range(n, n + 499);
      if (error) throw Error("Não foi possível carregar os representantes.");
      rows.push(...data);
      if (data.length < 500) break;
    }
    return rows;
  });
export const editarRepresentanteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => editarRepresentanteSchema.parse(v))
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarRepresentantes(a.papel)) throw Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<RepresentantesDB>;
    const r = await db
      .from("mimo_representantes")
      .update({ etapa: data.etapa, notas: data.notas })
      .eq("empresa_id", a.empresaId)
      .eq("id", data.id)
      .eq("versao", data.versao)
      .is("excluido_em", null)
      .select("id")
      .maybeSingle();
    if (r.error) throw Error("Não foi possível salvar a avaliação.");
    if (!r.data) throw Error("O cadastro mudou. Atualize a lista e reabra antes de salvar.");
    return r.data;
  });
export const historicoRepresentanteMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.string().uuid().parse(v))
  .handler(async ({ context, data: id }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarRepresentantes(a.papel)) throw Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<RepresentantesDB>;
    const r = await db
      .from("mimo_representantes_historico")
      .select("*")
      .eq("empresa_id", a.empresaId)
      .eq("representante_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) throw Error("Não foi possível carregar o histórico.");
    return r.data;
  });
export const excluirRepresentanteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) =>
    z.object({ id: z.string().uuid(), versao: z.number().int().positive() }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarRepresentantes(a.papel)) throw Error("Acesso negado.");
    const db = context.supabase as unknown as SupabaseClient<RepresentantesDB>;
    const r = await db.rpc("mimo_representante_excluir", { p_id: data.id, p_versao: data.versao });
    if (r.error) throw Error("Não foi possível excluir o representante.");
    if (!r.data) throw Error("O cadastro mudou ou já foi excluído. Atualize a lista.");
    return { excluido: true };
  });
