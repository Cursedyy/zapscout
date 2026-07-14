
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fila_envio_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uazapi_conectado_em timestamptz,
  ADD COLUMN IF NOT EXISTS envios_hoje integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS envios_hoje_data date,
  ADD COLUMN IF NOT EXISTS limite_diario_customizado integer,
  ADD COLUMN IF NOT EXISTS envio_horario_inicio time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS envio_horario_fim time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS envio_dias_semana smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::smallint[],
  ADD COLUMN IF NOT EXISTS envios_pausados_ate timestamptz,
  ADD COLUMN IF NOT EXISTS erros_envio_consecutivos integer NOT NULL DEFAULT 0;
