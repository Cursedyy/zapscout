import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  campanhaMimoSchema,
  podeGerenciarCampanhas,
  statusCampanhaMimoSchema,
} from "./mimo-campanhas";

export const listarCampanhasMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("mimo_campanhas_comerciais")
      .select("id,nome,inicio,fim,produtos,condicoes,status,versao,updated_at")
      .eq("empresa_id", acesso.empresaId)
      .order("inicio", { ascending: false });
    if (error) throw new Error("Não foi possível carregar as campanhas. Tente novamente.");
    return {
      campanhas: data.map((c) => ({ ...c, status: statusCampanhaMimoSchema.parse(c.status) })),
      podeGerenciar: podeGerenciarCampanhas(acesso.papel),
    };
  });

export const salvarCampanhaMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => campanhaMimoSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (!podeGerenciarCampanhas(acesso.papel))
      throw new Error("Somente administração, gestão e marketing podem editar campanhas.");
    const { id, versao, ...campos } = data;
    const query = id
      ? context.supabase
          .from("mimo_campanhas_comerciais")
          .update(campos)
          .eq("empresa_id", acesso.empresaId)
          .eq("id", id)
          .eq("versao", versao!)
      : context.supabase
          .from("mimo_campanhas_comerciais")
          .insert({ ...campos, empresa_id: acesso.empresaId });
    const { data: salvo, error } = await query.select("id").maybeSingle();
    if (error)
      throw new Error("Não foi possível salvar a campanha. Confira os campos e tente novamente.");
    if (!salvo)
      throw new Error("A campanha foi alterada por outra pessoa. Reabra a edição para atualizar.");
    return salvo;
  });
