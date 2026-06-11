import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const salvarFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ mensagem: z.string().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("feedbacks")
      .insert({
        user_id: userId,
        mensagem: data.mensagem,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
