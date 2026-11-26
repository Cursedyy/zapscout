-- PREPARADO, NÃO APLICADO. Etapa 2 de 2: aplicar somente depois de mimo-lider-marketing-1-enum.sql.
-- Líder de marketing recebe exatamente o escopo atual de Marketing; nada de pedidos, financeiro,
-- equipe/acessos ou gestão geral. Gerado a partir das definições ativas lidas em 2026-11-26.

ALTER POLICY campanhas_ler ON public.mimo_campanhas_comerciais USING ((is_membro_empresa(empresa_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_campanhas_comerciais.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa))) AND ((status = 'publicada'::text) OR tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]))));

ALTER POLICY campanhas_criar ON public.mimo_campanhas_comerciais WITH CHECK ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_campanhas_comerciais.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY campanhas_editar ON public.mimo_campanhas_comerciais USING ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_campanhas_comerciais.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa))))) WITH CHECK ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_campanhas_comerciais.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY influenciadores_ler ON public.mimo_influenciadores USING ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_influenciadores.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY influenciadores_avaliar ON public.mimo_influenciadores USING ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_influenciadores.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa))))) WITH CHECK ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_influenciadores.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY influenciadores_historico_ler ON public.mimo_influenciadores_historico USING ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_influenciadores_historico.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY representantes_ler ON public.mimo_representantes USING ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel, 'vendedor'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_representantes.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY representantes_avaliar ON public.mimo_representantes USING (((excluido_em IS NULL) AND tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel, 'vendedor'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_representantes.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa))))) WITH CHECK ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel, 'vendedor'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_representantes.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

ALTER POLICY representantes_historico_ler ON public.mimo_representantes_historico USING ((tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel, 'gestor'::empresa_papel, 'marketing'::empresa_papel, 'lider_marketing'::empresa_papel, 'vendedor'::empresa_papel]) AND (EXISTS ( SELECT 1
   FROM empresas
  WHERE ((empresas.id = mimo_representantes_historico.empresa_id) AND (empresas.slug = 'mimo'::text) AND empresas.ativa)))));

CREATE OR REPLACE FUNCTION public.mimo_importar_meta_ads(_empresa uuid, _nome text, _sha256 text, _linhas jsonb, _erros jsonb, _total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _imp uuid;
  _novas int := 0;
  _atual int := 0;
  r jsonb;
  _ins boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_membro_empresa(_empresa, _uid)
     OR public.empresa_papel_de(_empresa, _uid)::text NOT IN ('administrador','gestor','marketing','lider_marketing') THEN
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
END $function$;

CREATE OR REPLACE FUNCTION public.mimo_influenciador_excluir(p_id uuid, p_versao integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e uuid;
BEGIN
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL OR NOT public.tem_papel_empresa(e,auth.uid(),ARRAY['administrador','gestor','marketing','lider_marketing']::public.empresa_papel[])
 THEN RAISE EXCEPTION 'Access denied'; END IF;
 UPDATE public.mimo_influenciadores SET excluido_em=clock_timestamp(),excluido_por=auth.uid()
 WHERE id=p_id AND empresa_id=e AND versao=p_versao AND excluido_em IS NULL;
 RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.mimo_lead_bloquear_papeis()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(public.empresa_papel_de(NEW.empresa_id, auth.uid())::text,'') IN ('marketing','lider_marketing','administrativo') THEN
    RAISE EXCEPTION 'Este cargo não cadastra nem edita leads' USING ERRCODE='42501';
  END IF;
  IF NEW.responsavel_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id)
     AND coalesce(public.empresa_papel_de(NEW.empresa_id, NEW.responsavel_id)::text,'') IN ('marketing','lider_marketing','administrativo') THEN
    RAISE EXCEPTION 'Responsável inválido';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.mimo_representante_excluir(p_id uuid, p_versao integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e uuid;
BEGIN
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL OR NOT public.tem_papel_empresa(e,auth.uid(),ARRAY['administrador','gestor','marketing','lider_marketing','vendedor']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Access denied';END IF;
 UPDATE public.mimo_representantes SET excluido_em=clock_timestamp(),excluido_por=auth.uid() WHERE id=p_id AND empresa_id=e AND versao=p_versao AND excluido_em IS NULL;
 RETURN FOUND;
END $function$;