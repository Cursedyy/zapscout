-- Torna visível (via SQL/UI) o resultado do envio do alerta de escalonamento,
-- que antes falhava silenciosamente sem nenhum log quando telefone_alerta
-- não estava configurado ou a instância WhatsApp estava desconectada.
ALTER TABLE public.ia_escalonamentos
  ADD COLUMN IF NOT EXISTS alerta_status text,
  ADD COLUMN IF NOT EXISTS alerta_erro text;

ALTER TABLE public.ia_escalonamentos DROP CONSTRAINT IF EXISTS ia_escalonamentos_alerta_status_check;
ALTER TABLE public.ia_escalonamentos
  ADD CONSTRAINT ia_escalonamentos_alerta_status_check
  CHECK (alerta_status IS NULL OR alerta_status IN (
    'enviado', 'sem_telefone_configurado', 'sem_instancia_conectada', 'falha'
  ));
