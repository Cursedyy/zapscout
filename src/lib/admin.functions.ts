import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Redefine a senha de um usuário (apenas dono pode usar).
 */
export const adminResetSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        novaSenha: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId: callerId } = context;

    const { data: caller, error: cErr } = await supabaseAdmin
      .from("profiles")
      .select("plano")
      .eq("id", callerId)
      .maybeSingle();
    if (cErr) throw new Error("Erro ao verificar permissão");
    if (caller?.plano !== "dono") throw new Error("Acesso negado");

    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: data.novaSenha, email_confirm: true },
    );
    if (uErr) throw new Error(uErr.message);

    return { ok: true as const };
  });
