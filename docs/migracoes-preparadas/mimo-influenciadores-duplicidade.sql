-- Canonical identifiers and database uniqueness protect every insertion path.
ALTER TABLE public.mimo_influenciadores ADD COLUMN excluido_em timestamptz,
 ADD COLUMN excluido_por uuid;
ALTER TABLE public.mimo_influenciadores_historico ADD COLUMN acao text NOT NULL DEFAULT 'avaliacao';
CREATE FUNCTION public.mimo_influenciador_telefone(p_valor text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE n text;
BEGIN
 n=regexp_replace(p_valor,'[^0-9]','','g');
 IF n ~ '^0055[0-9]{10,11}$' THEN n=substr(n,5);
 ELSIF n ~ '^55[0-9]{10,11}$' THEN n=substr(n,3); END IF;
 IF n ~ '^[1-9]{2}[6-9][0-9]{7}$' THEN n=substr(n,1,2)||'9'||substr(n,3); END IF;
 IF n !~ '^[1-9]{2}[0-9]{8,9}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
 RETURN n;
END $$;
CREATE FUNCTION public.mimo_influenciador_perfil(p_valor text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$
 SELECT lower(regexp_replace(regexp_replace(regexp_replace(trim(p_valor),
 '^https?://(www\.)?(instagram\.com|tiktok\.com)/@?','','i'),'^@',''),'/$',''))
$$;
REVOKE ALL ON FUNCTION public.mimo_influenciador_telefone(text),public.mimo_influenciador_perfil(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_influenciador_telefone(text),public.mimo_influenciador_perfil(text) TO authenticated,service_role;

-- Stop if preexisting normalized duplicates exist. Never delete or merge applicants.
CREATE UNIQUE INDEX mimo_influenciadores_numero_unico ON public.mimo_influenciadores
 (empresa_id,public.mimo_influenciador_telefone(whatsapp));
CREATE UNIQUE INDEX mimo_influenciadores_perfil_unico ON public.mimo_influenciadores
 (empresa_id,rede,public.mimo_influenciador_perfil(perfil));

CREATE FUNCTION public.mimo_influenciador_normalizar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.whatsapp=public.mimo_influenciador_telefone(NEW.whatsapp);
 NEW.perfil=public.mimo_influenciador_perfil(NEW.perfil);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_influenciador_normalizar() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mimo_influenciador_normalizar_identidade BEFORE INSERT OR UPDATE OF whatsapp,perfil
 ON public.mimo_influenciadores FOR EACH ROW EXECUTE FUNCTION public.mimo_influenciador_normalizar();

CREATE OR REPLACE FUNCTION public.mimo_inscrever_influenciador(p_dados jsonb,p_ip_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE empresa uuid; tentativas integer; novo_id uuid;
BEGIN
 IF p_ip_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid request'; END IF;
 SELECT id INTO empresa FROM public.empresas WHERE slug='mimo' AND ativa;
 IF empresa IS NULL THEN RAISE EXCEPTION 'Campaign unavailable'; END IF;
 INSERT INTO public.mimo_influenciadores_limites(ip_hash,janela,tentativas)
 VALUES(p_ip_hash,date_trunc('hour',now()),1)
 ON CONFLICT(ip_hash,janela) DO UPDATE SET tentativas=mimo_influenciadores_limites.tentativas+1
 RETURNING mimo_influenciadores_limites.tentativas INTO tentativas;
 DELETE FROM public.mimo_influenciadores_limites WHERE janela<now()-interval '2 days';
 IF tentativas>30 THEN RETURN '"limite"'::jsonb; END IF;
 INSERT INTO public.mimo_influenciadores(empresa_id,nome,whatsapp,rede,perfil,cidade,uf,seguidores,visualizacoes,nicho,parceria,consentimento)
 VALUES(empresa,trim(p_dados->>'nome'),p_dados->>'whatsapp',p_dados->>'rede',p_dados->>'perfil',
 trim(p_dados->>'cidade'),p_dados->>'uf',(p_dados->>'seguidores')::integer,
 p_dados->>'visualizacoes',p_dados->>'nicho',p_dados->>'parceria',(p_dados->>'consentimento')::boolean)
 ON CONFLICT DO NOTHING RETURNING id INTO novo_id;
 IF novo_id IS NULL THEN RETURN '"duplicado"'::jsonb; END IF;
 RETURN '"recebido"'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.mimo_inscrever_influenciador(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_inscrever_influenciador(jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mimo_influenciador_auditar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id THEN RAISE EXCEPTION 'Immutable identity'; END IF;
  NEW.versao=OLD.versao+1; NEW.updated_at=clock_timestamp(); NEW.created_at=OLD.created_at;
 END IF;
 INSERT INTO public.mimo_influenciadores_historico(empresa_id,influenciador_id,etapa,notas,ator_id,acao)
 VALUES(NEW.empresa_id,NEW.id,NEW.etapa,NEW.notas,auth.uid(),
  CASE WHEN TG_OP='UPDATE' AND NEW.excluido_em IS DISTINCT FROM OLD.excluido_em THEN 'excluido' ELSE 'avaliacao' END);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_influenciador_auditar() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.mimo_influenciador_excluir(p_id uuid,p_versao integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e uuid;
BEGIN
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL OR NOT public.tem_papel_empresa(e,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 THEN RAISE EXCEPTION 'Access denied'; END IF;
 UPDATE public.mimo_influenciadores SET excluido_em=clock_timestamp(),excluido_por=auth.uid()
 WHERE id=p_id AND empresa_id=e AND versao=p_versao AND excluido_em IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.mimo_influenciador_excluir(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_influenciador_excluir(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
