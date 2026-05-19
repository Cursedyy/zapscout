
-- Enum para status de lead
CREATE TYPE public.lead_status AS ENUM ('novo','mensagem_enviada','respondeu_positivo','respondeu_negativo','sem_resposta','convertido','descartado');
CREATE TYPE public.campanha_status AS ENUM ('rascunho','agendada','em_andamento','pausada','concluida');
CREATE TYPE public.regiao_cor AS ENUM ('azul','verde','vermelho','amarelo');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  plano TEXT NOT NULL DEFAULT 'free',
  foto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_empresa TEXT NOT NULL,
  whatsapp TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  segmento TEXT,
  categoria TEXT,
  tem_site BOOLEAN DEFAULT false,
  site_url TEXT,
  avaliacao NUMERIC(2,1),
  total_avaliacoes INT DEFAULT 0,
  horario_funcionamento TEXT,
  link_maps TEXT,
  status public.lead_status NOT NULL DEFAULT 'novo',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_user_idx ON public.leads(user_id);
CREATE INDEX leads_status_idx ON public.leads(status);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own leads all" ON public.leads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- campanhas
CREATE TABLE public.campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  segmento_alvo TEXT,
  mensagem TEXT NOT NULL,
  status public.campanha_status NOT NULL DEFAULT 'rascunho',
  agendamento TIMESTAMPTZ,
  limite_por_hora INT NOT NULL DEFAULT 20,
  intervalo_segundos INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own campanhas all" ON public.campanhas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- followups
CREATE TABLE public.followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  numero INT NOT NULL,
  mensagem TEXT NOT NULL,
  dias_espera INT NOT NULL DEFAULT 3,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own followups all" ON public.followups FOR ALL
  USING (EXISTS (SELECT 1 FROM public.campanhas c WHERE c.id = campanha_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campanhas c WHERE c.id = campanha_id AND c.user_id = auth.uid()));

-- mensagens_enviadas
CREATE TABLE public.mensagens_enviadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  texto TEXT NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondeu BOOLEAN DEFAULT false,
  resposta TEXT,
  respondido_em TIMESTAMPTZ
);
ALTER TABLE public.mensagens_enviadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own msgs all" ON public.mensagens_enviadas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- regioes_prospectadas
CREATE TABLE public.regioes_prospectadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  status_cor public.regiao_cor NOT NULL DEFAULT 'azul',
  total_leads INT DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cidade, estado)
);
ALTER TABLE public.regioes_prospectadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own regioes all" ON public.regioes_prospectadas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- whatsapp_conexoes
CREATE TABLE public.whatsapp_conexoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT,
  status TEXT NOT NULL DEFAULT 'desconectado',
  qr_code TEXT,
  ultimo_ping TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_conexoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own whats all" ON public.whatsapp_conexoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: criar profile no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_leads BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_campanhas BEFORE UPDATE ON public.campanhas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
