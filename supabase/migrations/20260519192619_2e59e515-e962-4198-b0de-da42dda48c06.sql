-- Converte coluna para text (mantém valores existentes)
ALTER TABLE public.leads ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'novo';

-- Drop enum se ninguém mais usa
DROP TYPE IF EXISTS lead_status;

-- Constraint amigável
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('novo','contatado','respondeu','negociacao','fechado','perdido'));