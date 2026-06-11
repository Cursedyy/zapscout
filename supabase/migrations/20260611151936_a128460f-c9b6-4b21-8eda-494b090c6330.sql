
CREATE TABLE public.prospeccao_auto_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  nicho text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  score_min integer NOT NULL DEFAULT 60,
  limite_diario integer NOT NULL DEFAULT 20,
  template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  intervalo_segundos integer NOT NULL DEFAULT 60,
  enviados_hoje integer NOT NULL DEFAULT 0,
  ultimo_run_data date,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_auto_config TO authenticated;
GRANT ALL ON public.prospeccao_auto_config TO service_role;

ALTER TABLE public.prospeccao_auto_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prospeccao config all"
  ON public.prospeccao_auto_config
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER prospeccao_auto_config_touch
  BEFORE UPDATE ON public.prospeccao_auto_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
