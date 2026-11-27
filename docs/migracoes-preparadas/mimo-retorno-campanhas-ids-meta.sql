-- Preparada, nÃ£o aplicada. Requer backup verificado antes da ferramenta de migraÃ§Ã£o.
-- Preserva os IDs estÃ¡veis do relatÃ³rio Meta para atribuiÃ§Ã£o exata com
-- mimo_whatsapp_eventos.referencia_anuncio->>'id'. Nomes nunca sÃ£o chave.
ALTER TABLE public.mimo_meta_ads_metricas
  ADD COLUMN IF NOT EXISTS campanha_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conjunto_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS anuncio_id text NOT NULL DEFAULT '';

ALTER TABLE public.mimo_meta_ads_metricas
  DROP CONSTRAINT IF EXISTS mimo_meta_ads_metricas_campanha_id_check,
  DROP CONSTRAINT IF EXISTS mimo_meta_ads_metricas_conjunto_id_check,
  DROP CONSTRAINT IF EXISTS mimo_meta_ads_metricas_anuncio_id_check,
  ADD CONSTRAINT mimo_meta_ads_metricas_campanha_id_check CHECK (campanha_id = '' OR campanha_id ~ '^[0-9]{1,40}$'),
  ADD CONSTRAINT mimo_meta_ads_metricas_conjunto_id_check CHECK (conjunto_id = '' OR conjunto_id ~ '^[0-9]{1,40}$'),
  ADD CONSTRAINT mimo_meta_ads_metricas_anuncio_id_check CHECK (anuncio_id = '' OR anuncio_id ~ '^[0-9]{1,40}$');

CREATE INDEX IF NOT EXISTS mimo_meta_ads_metricas_anuncio_id
  ON public.mimo_meta_ads_metricas(empresa_id, anuncio_id, data_inicio)
  WHERE anuncio_id <> '';

CREATE OR REPLACE FUNCTION public.mimo_importar_meta_ads(_empresa uuid, _nome text, _sha256 text, _linhas jsonb, _erros jsonb, _total integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _uid uuid := auth.uid(); _imp uuid; _novas int := 0; _atual int := 0;
  r jsonb; _ins boolean;
BEGIN
  IF _uid IS NULL OR NOT public.is_membro_empresa(_empresa, _uid)
     OR public.empresa_papel_de(_empresa, _uid)::text NOT IN ('administrador','gestor','marketing','lider_marketing') THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_linhas) <> 'array' OR jsonb_array_length(_linhas) = 0 OR jsonb_array_length(_linhas) > 20000 THEN
    RAISE EXCEPTION 'linhas_invalidas' USING ERRCODE = '22023';
  END IF;
  IF _sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'hash_invalido' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.mimo_meta_ads_importacoes(empresa_id,importado_por,arquivo_nome,arquivo_sha256,linhas_total,linhas_com_erro,erros)
  VALUES(_empresa,_uid,left(_nome,200),_sha256,_total,jsonb_array_length(_erros),_erros) RETURNING id INTO _imp;
  FOR r IN SELECT * FROM jsonb_array_elements(_linhas) LOOP
    IF coalesce(r->>'campanha_id','') !~ '^([0-9]{1,40})?$'
       OR coalesce(r->>'conjunto_id','') !~ '^([0-9]{1,40})?$'
       OR coalesce(r->>'anuncio_id','') !~ '^([0-9]{1,40})?$' THEN
      RAISE EXCEPTION 'id_meta_invalido' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.mimo_meta_ads_metricas AS m
      (empresa_id,importacao_id,chave,data_inicio,data_fim,campanha_id,conjunto_id,anuncio_id,campanha,conjunto,anuncio,investimento,impressoes,alcance,cliques,leads_meta)
    VALUES(_empresa,_imp,r->>'chave',(r->>'data_inicio')::date,(r->>'data_fim')::date,
      coalesce(r->>'campanha_id',''),coalesce(r->>'conjunto_id',''),coalesce(r->>'anuncio_id',''),
      left(r->>'campanha',300),left(coalesce(r->>'conjunto',''),300),left(coalesce(r->>'anuncio',''),300),
      (r->>'investimento')::numeric,(r->>'impressoes')::bigint,(r->>'alcance')::bigint,(r->>'cliques')::bigint,(r->>'leads_meta')::bigint)
    ON CONFLICT(empresa_id,chave) DO UPDATE SET importacao_id=EXCLUDED.importacao_id,
      campanha_id=EXCLUDED.campanha_id,conjunto_id=EXCLUDED.conjunto_id,anuncio_id=EXCLUDED.anuncio_id,
      investimento=EXCLUDED.investimento,impressoes=EXCLUDED.impressoes,alcance=EXCLUDED.alcance,
      cliques=EXCLUDED.cliques,leads_meta=EXCLUDED.leads_meta,updated_at=now()
    RETURNING (xmax=0) INTO _ins;
    IF _ins THEN _novas:=_novas+1; ELSE _atual:=_atual+1; END IF;
  END LOOP;
  UPDATE public.mimo_meta_ads_importacoes SET linhas_novas=_novas,linhas_atualizadas=_atual,
    periodo_inicio=(SELECT min((e->>'data_inicio')::date) FROM jsonb_array_elements(_linhas)e),
    periodo_fim=(SELECT max((e->>'data_fim')::date) FROM jsonb_array_elements(_linhas)e) WHERE id=_imp;
  RETURN jsonb_build_object('id',_imp,'novas',_novas,'atualizadas',_atual);
END $function$;

REVOKE ALL ON FUNCTION public.mimo_importar_meta_ads(uuid,text,text,jsonb,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_importar_meta_ads(uuid,text,text,jsonb,jsonb,integer) TO authenticated;
