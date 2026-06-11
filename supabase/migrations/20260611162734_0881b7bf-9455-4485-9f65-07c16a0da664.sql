CREATE TABLE public.aquecimento_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  numero_destino text,
  duracao_dias int NOT NULL DEFAULT 14 CHECK (duracao_dias IN (7, 14, 30)),
  iniciado_em timestamptz,
  dia_referencia date,
  mensagens_hoje int NOT NULL DEFAULT 0,
  ultimo_envio_em timestamptz,
  proximo_envio_em timestamptz,
  total_enviadas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquecimento_config TO authenticated;
GRANT ALL ON public.aquecimento_config TO service_role;

ALTER TABLE public.aquecimento_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own warmup select" ON public.aquecimento_config
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own warmup insert" ON public.aquecimento_config
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own warmup update" ON public.aquecimento_config
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own warmup delete" ON public.aquecimento_config
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_aquecimento_updated_at
  BEFORE UPDATE ON public.aquecimento_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();