import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const conectarNuvemshopMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor"].includes(a.papel))
      throw Error("Acesso exclusivo à administração e gestão.");
    const { configOAuthNuvem, iniciarOAuthNuvem, COOKIE_NUVEM } =
      await import("./mimo-nuvemshop-oauth.server");
    const { getRequest, setCookie } = await import("@tanstack/react-start/server");
    const cfg = configOAuthNuvem(),
      request = getRequest();
    if (
      !cfg ||
      new URL(request.url).origin !== cfg.origin ||
      request.headers.get("origin") !== cfg.origin
    )
      throw Error("A conexão deve ser iniciada no endereço autorizado da MiMo.");
    const r = await iniciarOAuthNuvem(a.empresaId, context.userId);
    setCookie(COOKIE_NUVEM, r.state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return { url: r.url };
  });
