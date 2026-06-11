CREATE TABLE public.security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ip text,
  user_agent text,
  identifier text,
  reason text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX security_logs_created_at_idx ON public.security_logs (created_at DESC);
CREATE INDEX security_logs_event_type_idx ON public.security_logs (event_type, created_at DESC);
CREATE INDEX security_logs_ip_idx ON public.security_logs (ip, created_at DESC);

GRANT SELECT ON public.security_logs TO authenticated;
GRANT ALL ON public.security_logs TO service_role;

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Apenas o dono enxerga os logs; ninguém escreve pela API (somente service_role/edge).
CREATE POLICY "dono can view security logs"
  ON public.security_logs
  FOR SELECT
  TO authenticated
  USING (public.is_dono(auth.uid()));