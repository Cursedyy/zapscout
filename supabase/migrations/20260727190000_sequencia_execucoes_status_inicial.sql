-- Corrige parar_ao_mover_crm sendo ignorado pelo cron process-followups: a
-- flag existia em `sequencias` mas o cron nunca checava, porque não havia
-- como saber se o lead "moveu no CRM" sem um snapshot do status no início
-- da execução.
--
-- status_inicial guarda o status do lead no momento em que
-- iniciarSequencia() criou a execução — o cron compara contra o status
-- atual; qualquer diferença conta como "moveu no CRM" (distinto de
-- parar_ao_responder/parar_ao_fechar, que checam valores específicos).
--
-- Nullable e sem backfill: execuções já existentes ficam sem o snapshot
-- (parar_ao_mover_crm simplesmente não se aplica a elas, comportamento
-- idêntico ao bug atual — não piora nada). Só execuções novas, criadas
-- depois desta migration, ganham o valor.
ALTER TABLE public.sequencia_execucoes
  ADD COLUMN IF NOT EXISTS status_inicial text;

COMMENT ON COLUMN public.sequencia_execucoes.status_inicial IS
  'Snapshot de leads.status no momento em que a execução foi criada. Usado por
   parar_ao_mover_crm pra detectar mudança de status (qualquer valor diferente
   deste). NULL em execuções antigas — parar_ao_mover_crm não se aplica a elas.';
