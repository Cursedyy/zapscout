import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CATEGORIAS_FEEDBACK = ["bug", "ideia", "duvida", "melhoria"] as const;
export type CategoriaFeedback = (typeof CATEGORIAS_FEEDBACK)[number];

export const salvarFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      mensagem: z.string().min(1).max(2000),
      categoria: z.enum(CATEGORIAS_FEEDBACK).default("ideia"),
      imagem_path: z.string().max(500).optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("feedbacks")
      .insert({
        user_id: userId,
        mensagem: data.mensagem,
        categoria: data.categoria,
        imagem_path: data.imagem_path ?? null,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
