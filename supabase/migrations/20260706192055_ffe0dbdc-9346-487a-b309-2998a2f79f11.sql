
CREATE TABLE public.campanha_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campanha_id uuid REFERENCES public.campanhas(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL,
  attempt integer,
  http_status integer,
  error_message text,
  numero text,
  lead_nome text,
  campanha_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_dispatch_logs TO authenticated;
GRANT ALL ON public.campanha_dispatch_logs TO service_role;

ALTER TABLE public.campanha_dispatch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dispatch logs"
  ON public.campanha_dispatch_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX campanha_dispatch_logs_user_started_idx
  ON public.campanha_dispatch_logs (user_id, started_at DESC);
CREATE INDEX campanha_dispatch_logs_campanha_idx
  ON public.campanha_dispatch_logs (campanha_id, started_at DESC);
