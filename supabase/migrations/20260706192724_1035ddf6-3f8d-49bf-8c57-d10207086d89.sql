
CREATE TABLE public.campanha_cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  campanhas_consideradas integer NOT NULL DEFAULT 0,
  campanhas_iniciadas integer NOT NULL DEFAULT 0,
  leads_selecionados integer NOT NULL DEFAULT 0,
  mensagens_enviadas integer NOT NULL DEFAULT 0,
  concluidas integer NOT NULL DEFAULT 0,
  pulados integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ok boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campanha_cron_runs TO authenticated;
GRANT ALL ON public.campanha_cron_runs TO service_role;

ALTER TABLE public.campanha_cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cron runs"
  ON public.campanha_cron_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX campanha_cron_runs_started_idx
  ON public.campanha_cron_runs (started_at DESC);
