CREATE TABLE public.mimo_meta_ads_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  importado_por uuid NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_sha256 text NOT NULL,
  linhas_total integer NOT NULL DEFAULT 0,
  linhas_novas integer NOT NULL DEFAULT 0,
  linhas_atualizadas integer NOT NULL DEFAULT 0,
  linhas_com_erro integer NOT NULL DEFAULT 0,
  erros jsonb NOT NULL DEFAULT '[]'::jsonb,
  periodo_inicio date,
  periodo_fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, arquivo_sha256)
);
CREATE TABLE public.mimo_meta_ads_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  importacao_id uuid NOT NULL REFERENCES public.mimo_meta_ads_importacoes(id),
  chave text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  campanha text NOT NULL,
  conjunto text NOT NULL DEFAULT '',
  anuncio text NOT NULL DEFAULT '',
  investimento numeric(14,2),
  impressoes bigint,
  alcance bigint,
  cliques bigint,
  leads_meta bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, chave),
  CHECK (data_fim >= data_inicio),
  CHECK (investimento IS NULL OR investimento >= 0),
  CHECK (impressoes IS NULL OR impressoes >= 0),
  CHECK (alcance IS NULL OR alcance >= 0),
  CHECK (cliques IS NULL OR cliques >= 0),
  CHECK (leads_meta IS NULL OR leads_meta >= 0)
);
COMMENT ON COLUMN public.mimo_meta_ads_metricas.leads_meta IS 'Leads reported by Meta Ads; not CRM leads, not qualified, not sales. NULL = absent in file.';
CREATE INDEX mimo_meta_ads_metricas_periodo ON public.mimo_meta_ads_metricas(empresa_id, data_inicio);
GRANT SELECT ON public.mimo_meta_ads_importacoes TO authenticated;
GRANT SELECT ON public.mimo_meta_ads_metricas TO authenticated;
GRANT ALL ON public.mimo_meta_ads_importacoes TO service_role;
GRANT ALL ON public.mimo_meta_ads_metricas TO service_role;
ALTER TABLE public.mimo_meta_ads_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_meta_ads_metricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_meta_imp_read ON public.mimo_meta_ads_importacoes FOR SELECT TO authenticated USING (public.is_membro_empresa(empresa_id, auth.uid()));
CREATE POLICY mimo_meta_met_read ON public.mimo_meta_ads_metricas FOR SELECT TO authenticated USING (public.is_membro_empresa(empresa_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.mimo_importar_meta_ads(_empresa uuid, _nome text, _sha256 text, _linhas jsonb, _erros jsonb, _total integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _imp uuid;
  _novas int := 0;
  _atual int := 0;
  r jsonb;
  _ins boolean;
BEGIN
  IF _uid IS NULL OR NOT public.tem_papel_empresa(_empresa, _uid, ARRAY['administrador','gestor']::public.empresa_papel[]) THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_linhas) <> 'array' OR jsonb_array_length(_linhas) = 0 OR jsonb_array_length(_linhas) > 20000 THEN
    RAISE EXCEPTION 'linhas_invalidas' USING ERRCODE = '22023';
  END IF;
  IF _sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'hash_invalido' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.mimo_meta_ads_importacoes(empresa_id, importado_por, arquivo_nome, arquivo_sha256, linhas_total, linhas_com_erro, erros)
  VALUES (_empresa, _uid, left(_nome, 200), _sha256, _total, jsonb_array_length(_erros), _erros)
  RETURNING id INTO _imp;
  FOR r IN SELECT * FROM jsonb_array_elements(_linhas) LOOP
    INSERT INTO public.mimo_meta_ads_metricas AS m(empresa_id, importacao_id, chave, data_inicio, data_fim, campanha, conjunto, anuncio, investimento, impressoes, alcance, cliques, leads_meta)
    VALUES (_empresa, _imp, r->>'chave', (r->>'data_inicio')::date, (r->>'data_fim')::date, left(r->>'campanha',300), left(coalesce(r->>'conjunto',''),300), left(coalesce(r->>'anuncio',''),300),
      (r->>'investimento')::numeric, (r->>'impressoes')::bigint, (r->>'alcance')::bigint, (r->>'cliques')::bigint, (r->>'leads_meta')::bigint)
    ON CONFLICT (empresa_id, chave) DO UPDATE SET importacao_id = EXCLUDED.importacao_id, investimento = EXCLUDED.investimento, impressoes = EXCLUDED.impressoes,
      alcance = EXCLUDED.alcance, cliques = EXCLUDED.cliques, leads_meta = EXCLUDED.leads_meta, updated_at = now()
    RETURNING (xmax = 0) INTO _ins;
    IF _ins THEN _novas := _novas + 1; ELSE _atual := _atual + 1; END IF;
  END LOOP;
  UPDATE public.mimo_meta_ads_importacoes SET linhas_novas = _novas, linhas_atualizadas = _atual,
    periodo_inicio = (SELECT min((e->>'data_inicio')::date) FROM jsonb_array_elements(_linhas) e),
    periodo_fim = (SELECT max((e->>'data_fim')::date) FROM jsonb_array_elements(_linhas) e)
  WHERE id = _imp;
  RETURN jsonb_build_object('id', _imp, 'novas', _novas, 'atualizadas', _atual);
END $$;
REVOKE ALL ON FUNCTION public.mimo_importar_meta_ads(uuid, text, text, jsonb, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_importar_meta_ads(uuid, text, text, jsonb, jsonb, integer) TO authenticated;