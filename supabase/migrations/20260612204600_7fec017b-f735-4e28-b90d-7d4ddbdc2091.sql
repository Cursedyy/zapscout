
-- 1) Create aquecimento_chips
CREATE TABLE public.aquecimento_chips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text,
  numero_destino text,
  duracao_dias int NOT NULL DEFAULT 14 CHECK (duracao_dias IN (7,14,30)),
  intensidade text NOT NULL DEFAULT 'moderado' CHECK (intensidade IN ('suave','moderado','agressivo')),
  tipo_mensagem text NOT NULL DEFAULT 'misto' CHECK (tipo_mensagem IN ('casual','profissional','misto')),
  horario_inicio time NOT NULL DEFAULT '08:00',
  horario_fim time NOT NULL DEFAULT '20:00',
  dias_semana smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  ativo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pausado' CHECK (status IN ('aquecendo','pausado','concluido','erro')),
  iniciado_em timestamptz,
  dia_referencia date,
  mensagens_hoje int NOT NULL DEFAULT 0,
  total_enviadas int NOT NULL DEFAULT 0,
  ultimo_envio_em timestamptz,
  proximo_envio_em timestamptz,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquecimento_chips TO authenticated;
GRANT ALL ON public.aquecimento_chips TO service_role;

ALTER TABLE public.aquecimento_chips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chips"
  ON public.aquecimento_chips FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_aquecimento_chips_user ON public.aquecimento_chips(user_id);
CREATE INDEX idx_aquecimento_chips_ativo ON public.aquecimento_chips(ativo) WHERE ativo = true;

CREATE TRIGGER set_aquecimento_chips_updated_at
  BEFORE UPDATE ON public.aquecimento_chips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Max 5 chips por usuário
CREATE OR REPLACE FUNCTION public.enforce_aquecimento_chips_max()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.aquecimento_chips WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Limite de 5 chips de aquecimento por usuário atingido';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_aquecimento_chips_max_trg
  BEFORE INSERT ON public.aquecimento_chips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_aquecimento_chips_max();

-- 2) Migrar dados existentes de aquecimento_config -> aquecimento_chips
INSERT INTO public.aquecimento_chips
  (user_id, nome, numero_destino, duracao_dias, ativo, status,
   iniciado_em, dia_referencia, mensagens_hoje, total_enviadas,
   ultimo_envio_em, proximo_envio_em)
SELECT
  user_id,
  'Chip 1',
  numero_destino,
  duracao_dias,
  ativo,
  CASE WHEN ativo THEN 'aquecendo' ELSE 'pausado' END,
  iniciado_em,
  dia_referencia,
  mensagens_hoje,
  total_enviadas,
  ultimo_envio_em,
  proximo_envio_em
FROM public.aquecimento_config;

-- 3) Adicionar chip_id em mensagens_enviadas para histórico por chip
ALTER TABLE public.mensagens_enviadas
  ADD COLUMN chip_id uuid REFERENCES public.aquecimento_chips(id) ON DELETE SET NULL;

CREATE INDEX idx_mensagens_enviadas_chip ON public.mensagens_enviadas(chip_id) WHERE chip_id IS NOT NULL;

-- 4) Remover tabela antiga (substituída)
DROP TABLE public.aquecimento_config;
