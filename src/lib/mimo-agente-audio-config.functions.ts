import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const chaveAudioSchema = z.object({
  chave: z.string().trim().regex(/^sk-[A-Za-z0-9_-]{20,500}$/, "Confira a chave OpenAI informada."),
}).strict();

export const configurarAudioAgenteMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => chaveAudioSchema.parse(v))
  .handler(async ({ context, data }) => {
    const { exigirMimo } = await import("./mimo-leads.server");
    const a = await exigirMimo(context.supabase, context.userId);
    if (!["administrador", "gestor"].includes(a.papel)) throw Error("Acesso negado.");
    const { configurarAudioAgente } = await import("./mimo-agente-audio-config.server");
    return configurarAudioAgente(a.empresaId, context.userId, data.chave);
  });
