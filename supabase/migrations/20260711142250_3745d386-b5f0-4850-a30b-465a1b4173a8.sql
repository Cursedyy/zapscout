CREATE TABLE public.leads_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status_anterior text,
  status_novo text NOT NULL,
  origem text NOT NULL, -- ex: 'cron:process-envios-manuais', 'ia-vendas', 'cron:process-followups'
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_status_audit_lead ON public.leads_status_audit (lead_id, created_at DESC);
CREATE INDEX idx_leads_status_audit_user ON public.leads_status_audit (user_id, created_at DESC);

GRANT SELECT ON public.leads_status_audit TO authenticated;
GRANT ALL ON public.leads_status_audit TO service_role;

ALTER TABLE public.leads_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê seu próprio log de auditoria"
  ON public.leads_status_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
