import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProspeccaoAutoConfig = {
  ativo: boolean;
  nicho: string;
  cidade: string;
  score_min: number;
  limite_diario: number;
  template_id: string | null;
  intervalo_segundos: number;
  enviados_hoje: number;
  ultimo_run_data: string | null;
  last_sent_at: string | null;
};

export const getProspeccaoAutoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProspeccaoAutoConfig> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("prospeccao_auto_config")
      .select("ativo, nicho, cidade, score_min, limite_diario, template_id, intervalo_segundos, enviados_hoje, ultimo_run_data, last_sent_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (
      data ?? {
        ativo: false,
        nicho: "",
        cidade: "",
        score_min: 60,
        limite_diario: 20,
        template_id: null,
        intervalo_segundos: 60,
        enviados_hoje: 0,
        ultimo_run_data: null,
        last_sent_at: null,
      }
    );
  });

const SalvarProspeccaoSchema = z.object({
  ativo: z.boolean(),
  nicho: z.string().trim().max(120, "Nicho muito longo"),
  cidade: z.string().trim().max(120, "Cidade muito longa"),
  score_min: z.number().int().min(0).max(100).default(0),
  limite_diario: z.number().int().min(1).max(500).default(1),
  template_id: z.string().uuid().nullable().default(null),
  intervalo_segundos: z.number().int().min(30).max(3600).default(60),
}).refine(
  (data) => {
    if (data.ativo) {
      return data.nicho.length > 0 && data.cidade.length > 0 && data.template_id != null;
    }
    return true;
  },
  {
    message: "Para ativar, preencha nicho, cidade e template.",
    path: ["ativo"],
  }
);

export type SalvarProspeccaoInput = z.infer<typeof SalvarProspeccaoSchema>;

export const salvarProspeccaoAutoConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SalvarProspeccaoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("prospeccao_auto_config")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });
