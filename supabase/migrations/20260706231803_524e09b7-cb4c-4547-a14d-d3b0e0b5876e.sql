-- Idempotência na gravação de mensagens_enviadas
-- Evita rows duplicadas quando o cron `process-campaigns` roda com sobreposição
-- ou faz retentativa após uma falha transitória.

ALTER TABLE public.mensagens_enviadas
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Índice único parcial: só aplica quando a chave é definida (chamadas antigas
-- e outros fluxos que ainda não populam a chave permanecem intactos).
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_enviadas_idempotency_key_uidx
  ON public.mensagens_enviadas (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.mensagens_enviadas.idempotency_key IS
  'Chave determinística por tentativa lógica de envio (ex.: campanha:<id>:lead:<id>:attempt:<n>). Usada com upsert(onConflict, ignoreDuplicates) para garantir idempotência entre execuções sobrepostas do cron.';