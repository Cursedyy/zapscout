ALTER TABLE public.envios_manuais_fila
  DROP CONSTRAINT IF EXISTS envios_manuais_fila_status_chk;

ALTER TABLE public.envios_manuais_fila
  ADD CONSTRAINT envios_manuais_fila_status_chk
  CHECK (status IN ('pendente','enviando','enviado','falha','cancelado','recusada_limite'));

CREATE INDEX IF NOT EXISTS envios_manuais_fila_enviando_idx
  ON public.envios_manuais_fila (agendado_para)
  WHERE status = 'enviando';