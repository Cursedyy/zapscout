ALTER TYPE public.empresa_papel ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE public.empresa_papel ADD VALUE IF NOT EXISTS 'administrativo';

-- Administrativo opera pedidos (status, recebimentos) de todos os clientes, sem custo interno; marketing não atua no Tira-pedido.
CREATE OR REPLACE FUNCTION public.mimo_tira_ator(_empresa uuid, _ator uuid, _lead uuid, _gestao boolean)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m public.empresa_membros; l public.mimo_leads;
BEGIN
  PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo FOR UPDATE;
  IF m.id IS NULL OR m.papel::text NOT IN ('administrador','gestor','vendedor','administrativo')
     OR (_gestao AND m.papel::text NOT IN ('administrador','gestor','administrativo')) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501';
  END IF;
  IF _lead IS NOT NULL THEN
    SELECT * INTO l FROM public.mimo_leads WHERE id=_lead AND empresa_id=_empresa FOR UPDATE;
    IF l.id IS NULL OR (m.papel::text='vendedor' AND l.responsavel_id IS DISTINCT FROM _ator) THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN m.papel::text;
END $function$;

-- Administrativo lê os clientes para operar pedidos; não edita leads (bloqueado pelo gatilho abaixo e pelas regras de edição).
CREATE OR REPLACE FUNCTION public.pode_ver_mimo_lead(_lead_id uuid, _user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.mimo_leads l
    WHERE l.id = _lead_id
      AND public.is_membro_empresa(l.empresa_id, _user_id)
      AND (public.tem_papel_empresa(l.empresa_id, _user_id, ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel])
           OR public.empresa_papel_de(l.empresa_id, _user_id)::text = 'administrativo'
           OR (l.responsavel_id = _user_id AND public.empresa_papel_de(l.empresa_id, _user_id)::text = 'vendedor'))
  )
$function$;

CREATE OR REPLACE FUNCTION public.mimo_lead_bloquear_papeis()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(public.empresa_papel_de(NEW.empresa_id, auth.uid())::text,'') IN ('marketing','administrativo') THEN
    RAISE EXCEPTION 'Este cargo não cadastra nem edita leads' USING ERRCODE='42501';
  END IF;
  IF NEW.responsavel_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id)
     AND coalesce(public.empresa_papel_de(NEW.empresa_id, NEW.responsavel_id)::text,'') IN ('marketing','administrativo') THEN
    RAISE EXCEPTION 'Responsável inválido';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.mimo_lead_bloquear_papeis() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mimo_lead_bloquear_papeis BEFORE INSERT OR UPDATE ON public.mimo_leads
  FOR EACH ROW EXECUTE FUNCTION public.mimo_lead_bloquear_papeis();

CREATE OR REPLACE FUNCTION public.mimo_importar_meta_ads(_empresa uuid, _nome text, _sha256 text, _linhas jsonb, _erros jsonb, _total integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
     OR public.empresa_papel_de(_empresa, _uid)::text NOT IN ('administrador','gestor','marketing') THEN
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