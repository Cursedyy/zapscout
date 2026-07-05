-- 1) Colunas novas (todas nullable — features 1/2 vão preencher depois)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tem_whatsapp BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_verificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tipo_site TEXT,
  ADD COLUMN IF NOT EXISTS tipo_telefone TEXT,
  ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;

-- Constraints de domínio (via trigger seria excessivo — CHECK simples serve)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tipo_site_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_tipo_site_check
  CHECK (tipo_site IS NULL OR tipo_site IN ('sem_site','site_social','site_proprio'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tipo_telefone_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_tipo_telefone_check
  CHECK (tipo_telefone IS NULL OR tipo_telefone IN ('celular','fixo'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_score_range_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_score_range_check
  CHECK (score BETWEEN 0 AND 100);

-- 2) Helper: classificar telefone BR (celular = 9 dígitos após DDD começando com 9; fixo = 8 dígitos)
CREATE OR REPLACE FUNCTION public.classificar_telefone(_tel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d TEXT;
  local_num TEXT;
BEGIN
  IF _tel IS NULL OR btrim(_tel) = '' THEN RETURN NULL; END IF;
  d := regexp_replace(_tel, '\D', '', 'g');
  IF d LIKE '55%' AND length(d) >= 12 THEN
    d := substring(d from 3);
  END IF;
  IF length(d) < 10 THEN RETURN NULL; END IF;
  local_num := substring(d from 3);
  IF length(local_num) = 9 AND left(local_num, 1) = '9' THEN
    RETURN 'celular';
  ELSIF length(local_num) = 8 THEN
    RETURN 'fixo';
  END IF;
  RETURN NULL;
END;
$$;

-- 3) Função de cálculo de score
CREATE OR REPLACE FUNCTION public.calcular_score_lead(
  _tipo_site TEXT,
  _tipo_telefone TEXT,
  _tem_whatsapp BOOLEAN,
  _avaliacao NUMERIC,
  _total_avaliacoes INTEGER,
  _site_url TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s INTEGER := 0;
BEGIN
  -- Presença web
  IF _tipo_site = 'sem_site' THEN s := s + 30;
  ELSIF _tipo_site = 'site_social' THEN s := s + 20;
  END IF;

  -- Telefone
  IF _tipo_telefone = 'celular' THEN s := s + 15; END IF;

  -- WhatsApp validado
  IF _tem_whatsapp IS TRUE THEN s := s + 15; END IF;

  -- Reputação
  IF _avaliacao IS NOT NULL AND _avaliacao >= 4.0
     AND COALESCE(_total_avaliacoes, 0) >= 10 THEN
    s := s + 10;
  END IF;
  IF COALESCE(_total_avaliacoes, 0) >= 50 THEN
    s := s + 5;
  END IF;

  -- Instagram detectado na URL "site"
  IF _site_url IS NOT NULL AND _site_url ILIKE '%instagram.com%' THEN
    s := s + 5;
  END IF;

  RETURN LEAST(GREATEST(s, 0), 100);
END;
$$;

-- 4) Trigger: mantém score e tipo_telefone sempre coerentes
CREATE OR REPLACE FUNCTION public.leads_atualizar_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Classifica telefone se não veio explícito
  IF NEW.tipo_telefone IS NULL AND NEW.telefone IS NOT NULL THEN
    NEW.tipo_telefone := public.classificar_telefone(NEW.telefone);
  END IF;

  NEW.score := public.calcular_score_lead(
    NEW.tipo_site,
    NEW.tipo_telefone,
    NEW.tem_whatsapp,
    NEW.avaliacao,
    NEW.total_avaliacoes,
    NEW.site_url
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_score_biu ON public.leads;
CREATE TRIGGER leads_score_biu
BEFORE INSERT OR UPDATE OF tipo_site, tipo_telefone, tem_whatsapp, avaliacao, total_avaliacoes, site_url, telefone, score
ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_atualizar_score();

-- 5) Backfill retroativo
-- 5a) tipo_telefone via regex
UPDATE public.leads
SET tipo_telefone = public.classificar_telefone(telefone)
WHERE tipo_telefone IS NULL AND telefone IS NOT NULL;

-- 5b) tipo_site conservador (só o que dá para inferir sem HTTP)
UPDATE public.leads
SET tipo_site = CASE
  WHEN site_url IS NULL OR btrim(site_url) = '' OR tem_site = false THEN 'sem_site'
  WHEN site_url ~* '(instagram\.com|facebook\.com|fb\.com|linktr\.ee|linklist\.bio|beacons\.ai|bio\.link|wa\.me|api\.whatsapp\.com|whatsapp\.com|taplink|linktree)'
    THEN 'site_social'
  ELSE NULL  -- Feature 2 vai classificar via HEAD request
END
WHERE tipo_site IS NULL;

-- 5c) recalcula score de todos os leads existentes disparando o trigger
UPDATE public.leads SET score = public.calcular_score_lead(
  tipo_site, tipo_telefone, tem_whatsapp, avaliacao, total_avaliacoes, site_url
);

-- 6) Índice para ordenação por score dentro de cada usuário
CREATE INDEX IF NOT EXISTS leads_user_score_idx
  ON public.leads (user_id, score DESC, created_at DESC);
