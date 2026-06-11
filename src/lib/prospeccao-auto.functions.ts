import { createServerFn } from "@tanstack/react-start";
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

export type SalvarProspeccaoInput = {
  ativo: boolean;
  nicho: string;
  cidade: string;
  score_min: number;
  limite_diario: number;
  template_id: string | null;
  intervalo_segundos: number;
};

export const salvarProspeccaoAutoConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SalvarProspeccaoInput) => {
    const nicho = String(input.nicho ?? "").trim().slice(0, 120);
    const cidade = String(input.cidade ?? "").trim().slice(0, 120);
    const score_min = Math.max(0, Math.min(100, Math.round(Number(input.score_min) || 0)));
    const limite_diario = Math.max(1, Math.min(500, Math.round(Number(input.limite_diario) || 1)));
    const intervalo_segundos = Math.max(30, Math.min(3600, Math.round(Number(input.intervalo_segundos) || 60)));
    const template_id = input.template_id ? String(input.template_id) : null;
    if (input.ativo && (!nicho || !cidade || !template_id)) {
      throw new Error("Para ativar, preencha nicho, cidade e template.");
    }
    return { ativo: !!input.ativo, nicho, cidade, score_min, limite_diario, intervalo_segundos, template_id };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("prospeccao_auto_config")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });
