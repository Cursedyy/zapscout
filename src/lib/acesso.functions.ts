import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Valida um token de acesso (enviado por e-mail após compra na Kiwify).
 * Retorna nome/email/plano se válido — sem expor o user_id.
 */
export const validarTokenAcesso = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, email, plano")
      .eq("token_acesso", data.token)
      .maybeSingle();

    if (error) throw new Error("Erro ao validar token");
    if (!profile) return { ok: false as const };

    return {
      ok: true as const,
      nome: profile.nome ?? "",
      email: profile.email ?? "",
      plano: profile.plano ?? "pro",
    };
  });

/**
 * Redime o token: define a senha definitiva do usuário e invalida o token.
 * Após sucesso, o cliente faz `supabase.auth.signInWithPassword` com o email + senha.
 */
export const redimirTokenAcesso = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token: z.string().min(8).max(128),
        senha: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("token_acesso", data.token)
      .maybeSingle();

    if (pErr) throw new Error("Erro ao validar token");
    if (!profile) throw new Error("Token inválido ou já utilizado");

    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: data.senha,
      email_confirm: true,
    });
    if (uErr) throw new Error(uErr.message);

    const { error: clearErr } = await supabaseAdmin
      .from("profiles")
      .update({ token_acesso: null, senha_definida: true })
      .eq("id", profile.id);
    if (clearErr) throw new Error(clearErr.message);

    return { ok: true as const, email: profile.email ?? "" };
  });

/**
 * Verifica se um email já está cadastrado (em profiles).
 * Usado para bloquear cadastro duplicado antes de chamar supabase.auth.signUp.
 */
export const verificarEmailExiste = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    return { existe: !!prof };
  });

