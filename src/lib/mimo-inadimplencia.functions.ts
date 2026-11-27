import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { periodoInadimplenciaSchema, type ResultadoInadimplencia } from "./mimo-inadimplencia";

export const MENSAGEM_OMIE_INDISPONIVEL =
  "Integração Omie indisponível: as credenciais do Omie da MiMo não estão configuradas no servidor. Solicite a configuração à administração.";

export type RespostaInadimplencia =
  { disponivel: false; mensagem: string } | { disponivel: true; resultado: ResultadoInadimplencia };

/**
 * Consulta somente leitura de "Contas a Receber" no Omie. Revalida empresa fixa,
 * vínculo ativo e papel administrador/gestor a cada chamada (dados financeiros).
 */
export const consultarInadimplenciaMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(periodoInadimplenciaSchema)
  .handler(async ({ context, data }): Promise<RespostaInadimplencia> => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (acesso.papel !== "administrador" && acesso.papel !== "gestor")
      throw Error("Acesso exclusivo à administração e gestão.");
    const { configOmie } = await import("./mimo-omie.server");
    const cfg = configOmie();
    if (!cfg || cfg.empresaId !== acesso.empresaId)
      return { disponivel: false, mensagem: MENSAGEM_OMIE_INDISPONIVEL };
    const { consultarInadimplenciaOmie } = await import("./mimo-inadimplencia.server");
    return { disponivel: true, resultado: await consultarInadimplenciaOmie(cfg, data) };
  });
