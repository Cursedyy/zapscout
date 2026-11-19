import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  alterarFeedbackMimoSchema,
  cursorFeedbackMimoSchema,
  lerEstadoFeedbackMimo,
  novoFeedbackMimoSchema,
} from "./mimo-feedback";

const POR_PAGINA = 20;

export const listarFeedbacksMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ cursor: cursorFeedbackMimoSchema.nullable() }).strict())
  .handler(async ({ context: { supabase, userId }, data: { cursor } }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(supabase, userId);
    const consulta = supabase
      .from("mimo_feedbacks")
      .select("id,titulo,mensagem,estado,versao,created_at")
      .eq("empresa_id", acesso.empresaId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(POR_PAGINA + 1);
    if (cursor) {
      consulta.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    }
    const { data, error } = await consulta;
    if (error) throw new Error("Não foi possível carregar os feedbacks.");
    const feedbacks = data.slice(0, POR_PAGINA).map((f) => ({
      ...f,
      estado: lerEstadoFeedbackMimo(f.estado),
    }));
    const ultimo = feedbacks.at(-1);
    return {
      feedbacks,
      proximo: data.length > POR_PAGINA && ultimo
        ? { id: ultimo.id, created_at: ultimo.created_at }
        : null,
      podeGerenciar: acesso.papel === "administrador",
    };
  });

export const enviarFeedbackMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(novoFeedbackMimoSchema)
  .handler(async ({ context: { supabase, userId }, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(supabase, userId);
    const { error } = await supabase.from("mimo_feedbacks").insert({ ...data, empresa_id: acesso.empresaId });
    if (!error) return { id: data.id };

    if (error.code === "23505") {
      // Uma tentativa repetida após perda da resposta pode ter sido salva.
      const { data: existente } = await supabase
        .from("mimo_feedbacks").select("id,titulo,mensagem")
        .eq("empresa_id", acesso.empresaId).eq("id", data.id).eq("criado_por", userId)
        .maybeSingle();
      if (existente?.titulo === data.titulo && existente.mensagem === data.mensagem)
        return { id: existente.id };
    }
    throw new Error("Não foi possível enviar a sugestão. Tente novamente.");
  });

export const alterarFeedbackMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(alterarFeedbackMimoSchema)
  .handler(async ({ context: { supabase, userId }, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(supabase, userId);
    if (acesso.papel !== "administrador") throw new Error("Somente o administrador pode gerenciar feedbacks.");

    const { data: atualizado, error } = await supabase
      .from("mimo_feedbacks").update({ estado: data.estado })
      .eq("empresa_id", acesso.empresaId).eq("id", data.id).eq("versao", data.versao)
      .select("id").maybeSingle();
    if (error) throw new Error("Não foi possível atualizar o feedback. Tente novamente.");
    if (!atualizado) throw new Error("O feedback foi alterado. Confira o status atual e tente novamente.");
    return atualizado;
  });
