
CREATE TABLE public.ia_config (
  user_id uuid PRIMARY KEY,
  nome_agente text NOT NULL DEFAULT 'Ana',
  cargo text NOT NULL DEFAULT 'Consultora',
  nome_agencia text NOT NULL DEFAULT '',
  tom text NOT NULL DEFAULT 'amigavel',
  servicos text NOT NULL DEFAULT '',
  diferenciais text NOT NULL DEFAULT '',
  restricoes text NOT NULL DEFAULT '',
  objetivos jsonb NOT NULL DEFAULT '["qualificar","duvidas","agendar"]'::jsonb,
  mensagens_para_escalar int NOT NULL DEFAULT 3,
  horario_modo text NOT NULL DEFAULT 'sempre',
  horario_inicio text NOT NULL DEFAULT '08:00',
  horario_fim text NOT NULL DEFAULT '18:00',
  mensagem_boas_vindas text NOT NULL DEFAULT 'Olá! 😊 Que bom falar com você. Como posso ajudar?',
  ativa boolean NOT NULL DEFAULT true,
  mensagens_mes_count int NOT NULL DEFAULT 0,
  mensagens_mes_reset timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ia_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ia_config all" ON public.ia_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ia_config_touch BEFORE UPDATE ON public.ia_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ia_qas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pergunta text NOT NULL,
  resposta text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ia_qas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ia_qas all" ON public.ia_qas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ia_qas_user_idx ON public.ia_qas(user_id);

CREATE TABLE public.ia_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  ia_ativa boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ativa',
  mensagens jsonb NOT NULL DEFAULT '[]'::jsonb,
  ultima_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lead_id)
);
ALTER TABLE public.ia_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ia_conversas all" ON public.ia_conversas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ia_conversas_user_idx ON public.ia_conversas(user_id, ultima_em DESC);
CREATE TRIGGER ia_conversas_touch BEFORE UPDATE ON public.ia_conversas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ia_escalonamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  conversa_id uuid NOT NULL,
  motivo text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ia_escalonamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ia_escal all" ON public.ia_escalonamentos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ia_escal_user_idx ON public.ia_escalonamentos(user_id, lida, created_at DESC);
