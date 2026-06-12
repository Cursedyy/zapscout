
CREATE INDEX IF NOT EXISTS leads_user_created_idx
  ON public.leads (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS leads_user_status_created_idx
  ON public.leads (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS leads_user_follow_up_idx
  ON public.leads (user_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS msgs_user_enviado_idx
  ON public.mensagens_enviadas (user_id, enviado_em DESC);

CREATE INDEX IF NOT EXISTS msgs_user_lead_idx
  ON public.mensagens_enviadas (user_id, lead_id);

CREATE INDEX IF NOT EXISTS campanhas_user_status_created_idx
  ON public.campanhas (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS campanhas_user_created_idx
  ON public.campanhas (user_id, created_at DESC);
