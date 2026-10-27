ALTER TABLE public.ia_config ADD COLUMN IF NOT EXISTS destinos_escalonamento jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.ia_escalonamentos ADD COLUMN IF NOT EXISTS destino text;