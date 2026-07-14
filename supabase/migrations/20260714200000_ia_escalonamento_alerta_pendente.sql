ALTER TABLE public.ia_escalonamentos DROP CONSTRAINT IF EXISTS ia_escalonamentos_alerta_status_check;
ALTER TABLE public.ia_escalonamentos
  ADD CONSTRAINT ia_escalonamentos_alerta_status_check
  CHECK (alerta_status IS NULL OR alerta_status IN (
    'pendente', 'enviado', 'sem_telefone_configurado', 'sem_instancia_conectada', 'falha'
  ));
