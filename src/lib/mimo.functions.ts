import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const obterAcessoMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { consultarAcessoMimo } = await import("@/lib/mimo-acesso.server");
    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    return consultarAcessoMimo(context.supabase, context.userId, email);
  });