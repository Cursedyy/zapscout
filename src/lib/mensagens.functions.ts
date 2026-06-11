import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const registrarMensagemEnviada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      leadId: z.string().min(1).max(120),
      texto: z.string().min(1).max(4096),
      status: z.enum(["enviado", "falha", "pendente"]).default("enviado"),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("mensagens_enviadas").insert({
      user_id: userId,
      lead_id: data.leadId,
      texto: data.texto,
      status: data.status,
      campanha_id: null,
      step: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
