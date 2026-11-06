import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { idNuvemSchema } from "./mimo-carrinhos";
async function acesso(c: { supabase: SupabaseClient<Database>; userId: string }) {
  const { exigirMimo } = await import("./mimo-leads.server");
  const a = await exigirMimo(c.supabase, c.userId);
  if (!["administrador", "gestor"].includes(a.papel))
    throw Error("Acesso exclusivo à administração e gestão.");
  return a;
}
export const obterPainelEmailMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const { configGmail } = await import("./mimo-gmail.server");
    const { rpcEmail, ErroEmailRpc } = await import("./mimo-email-db.server");
    const cfg = configGmail();
    const configurada = !!cfg && cfg.empresa === a.empresaId;
    try {
      const d = z
        .object({
          conectado: z.boolean(),
          remetente: z.string().nullable(),
          ativo: z.boolean(),
          pilotoOk: z.boolean(),
          inicioEm: z.string().nullable(),
          enviadas: z.number().int().nonnegative(),
          pendentes: z.number().int().nonnegative(),
          incertas: z.number().int().nonnegative(),
        })
        .parse(
          await rpcEmail("mimo_email_painel", { _empresa: a.empresaId, _ator: context.userId }),
        );
      return { ...d, configurada, disponivel: true };
    } catch (e) {
      if (e instanceof ErroEmailRpc && ["PGRST202", "42883"].includes(e.codigo))
        return {
          configurada,
          disponivel: false,
          conectado: false,
          remetente: null,
          ativo: false,
          pilotoOk: false,
          inicioEm: null,
          enviadas: 0,
          pendentes: 0,
          incertas: 0,
        };
      throw Error("Não foi possível consultar a conexão de e-mail.");
    }
  });
export const conectarGmailMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await acesso(context);
    const { configGmail, iniciarGmail, COOKIE_GMAIL } = await import("./mimo-gmail.server");
    const { getRequest, setCookie } = await import("@tanstack/react-start/server");
    const cfg = configGmail(),
      r = getRequest();
    if (
      !cfg ||
      cfg.empresa !== a.empresaId ||
      new URL(r.url).origin !== cfg.origem ||
      r.headers.get("origin") !== cfg.origem
    )
      throw Error("Inicie a conexão no endereço autorizado da MiMo.");
    const inicio = await iniciarGmail(a.empresaId, context.userId);
    setCookie(COOKIE_GMAIL, inicio.state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return { url: inicio.url };
  });
export const configurarEmailMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ ativo: z.boolean() }).parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    if (data.ativo) {
      const { acessoGmail } = await import("./mimo-gmail.server");
      await acessoGmail(a.empresaId, context.userId);
    }
    const { rpcEmail } = await import("./mimo-email-db.server");
    await rpcEmail("mimo_email_configurar", {
      _empresa: a.empresaId,
      _ator: context.userId,
      _ativo: data.ativo,
    });
    return { ativo: data.ativo };
  });
export const enviarTesteEmailMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .refine((v) => !/[\r\n<>"\\]/.test(v)),
        checkout: idNuvemSchema,
        id: z.string().uuid(),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    const { testarEmailMimo } = await import("./mimo-email-worker.server");
    try {
      return { resultado: await testarEmailMimo(a.empresaId, context.userId, data) };
    } catch {
      throw Error(
        "Não foi possível concluir o teste. Verifique o estado e a conexão antes de tentar novamente.",
      );
    }
  });
export const enviarEmailManualMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ checkout: idNuvemSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const a = await acesso(context);
    const { executarEmailMimo } = await import("./mimo-email-worker.server");
    try {
      return {
        resultado: await executarEmailMimo({
          empresa: a.empresaId,
          ator: context.userId,
          checkout: data.checkout,
        }),
      };
    } catch {
      throw Error(
        "Não foi possível concluir o e-mail. Atualize o carrinho para verificar o estado antes de tentar novamente.",
      );
    }
  });
