import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MIMO_SLUG, resolverAcessoMimo } from "@/lib/mimo-acesso";

export const obterAcessoMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: empresa, error: erroEmpresa } = await supabase
      .from("empresas")
      .select("id, nome, ativa")
      .eq("slug", MIMO_SLUG)
      .maybeSingle();
    if (erroEmpresa) throw new Error("Não foi possível verificar o acesso.");
    if (!empresa) return resolverAcessoMimo(null, null, "");

    const [{ data: membro, error: erroMembro }, { data: perfil }] = await Promise.all([
      supabase
        .from("empresa_membros")
        .select("papel, ativo")
        .eq("empresa_id", empresa.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
    ]);
    if (erroMembro) throw new Error("Não foi possível verificar o acesso.");
    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    return resolverAcessoMimo(empresa, membro, perfil?.nome?.trim() || email || "Usuário");
  });