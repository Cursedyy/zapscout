-- PREPARADA, NÃO APLICADA. Aplicar após mimo-carrinhos.sql e verificação de backup.
CREATE TABLE public.mimo_nuvem_oauth_estados (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), loja_id text NOT NULL CHECK(loja_id ~ '^[1-9][0-9]{0,18}$'),
 ator_id uuid NOT NULL REFERENCES auth.users(id), criado_em timestamptz NOT NULL DEFAULT now(),
 expira_em timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 consumido_em timestamptz, finalizado_em timestamptz
);
CREATE INDEX ON public.mimo_nuvem_oauth_estados(ator_id,criado_em);
CREATE TABLE public.mimo_nuvem_credenciais (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id), loja_id text NOT NULL UNIQUE,
 token_cifrado text NOT NULL CHECK(length(token_cifrado) BETWEEN 64 AND 10000 AND token_cifrado ~ '^v1:[a-f0-9]{24}:[a-f0-9]+$'),
 atualizado_em timestamptz NOT NULL DEFAULT now(), atualizado_por uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.mimo_nuvem_oauth_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_nuvem_credenciais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_nuvem_oauth_estados,public.mimo_nuvem_credenciais FROM anon,authenticated,service_role;
-- No browser policies. Even encrypted credentials and OAuth state are service-RPC only.
CREATE FUNCTION public.mimo_nuvem_oauth_acesso(_empresa uuid,_ator uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.mimo_nuvem_oauth_acesso(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mimo_nuvem_oauth_iniciar(_empresa uuid,_loja text,_ator uuid,_hash text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text,0));
 IF EXISTS(SELECT 1 FROM public.mimo_nuvem_lojas WHERE empresa_id=_empresa AND loja_id<>_loja)
   OR EXISTS(SELECT 1 FROM public.mimo_nuvem_credenciais WHERE empresa_id=_empresa AND loja_id<>_loja)
   THEN RAISE EXCEPTION 'Vínculo da loja não pode mudar'; END IF;
 IF (SELECT count(*) FROM public.mimo_nuvem_oauth_estados WHERE ator_id=_ator AND criado_em>now()-interval '10 minutes')>=5
   THEN RAISE EXCEPTION 'Aguarde antes de tentar novamente'; END IF;
 IF EXISTS(SELECT 1 FROM public.mimo_nuvem_oauth_estados WHERE empresa_id=_empresa AND consumido_em IS NOT NULL AND finalizado_em IS NULL AND expira_em>clock_timestamp())
   THEN RAISE EXCEPTION 'Uma autorização ainda está sendo processada'; END IF;
 UPDATE public.mimo_nuvem_oauth_estados SET expira_em=clock_timestamp() WHERE empresa_id=_empresa AND finalizado_em IS NULL;
 INSERT INTO public.mimo_nuvem_oauth_estados(hash,empresa_id,loja_id,ator_id) VALUES(_hash,_empresa,_loja,_ator);
END $$;
CREATE FUNCTION public.mimo_nuvem_oauth_consumir(_hash text) RETURNS TABLE(empresa_id uuid,loja_id text,ator_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.mimo_nuvem_oauth_estados;
BEGIN
 SELECT * INTO e FROM public.mimo_nuvem_oauth_estados WHERE hash=_hash FOR UPDATE;
 IF NOT FOUND OR e.consumido_em IS NOT NULL OR e.expira_em<=clock_timestamp()+interval '30 seconds' THEN RAISE EXCEPTION 'Autorização expirada ou usada'; END IF;
 PERFORM public.mimo_nuvem_oauth_acesso(e.empresa_id,e.ator_id);
 UPDATE public.mimo_nuvem_oauth_estados SET consumido_em=clock_timestamp() WHERE hash=_hash;
 RETURN QUERY SELECT e.empresa_id,e.loja_id,e.ator_id;
END $$;
CREATE FUNCTION public.mimo_nuvem_oauth_salvar(_hash text,_empresa uuid,_loja text,_ator uuid,_cifrado text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.mimo_nuvem_oauth_estados;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text,0));
 SELECT * INTO e FROM public.mimo_nuvem_oauth_estados WHERE hash=_hash FOR UPDATE;
 IF NOT FOUND OR e.empresa_id<>_empresa OR e.loja_id<>_loja OR e.ator_id<>_ator OR e.consumido_em IS NULL
   OR e.finalizado_em IS NOT NULL OR e.expira_em<=clock_timestamp() THEN RAISE EXCEPTION 'Autorização inválida'; END IF;
 IF EXISTS(SELECT 1 FROM public.mimo_nuvem_lojas WHERE empresa_id=_empresa AND loja_id<>_loja)
   OR EXISTS(SELECT 1 FROM public.mimo_nuvem_credenciais WHERE empresa_id=_empresa AND loja_id<>_loja)
   THEN RAISE EXCEPTION 'Vínculo divergente'; END IF;
 INSERT INTO public.mimo_nuvem_credenciais(empresa_id,loja_id,token_cifrado,atualizado_por) VALUES(_empresa,_loja,_cifrado,_ator)
 ON CONFLICT(empresa_id) DO UPDATE SET token_cifrado=EXCLUDED.token_cifrado,atualizado_por=_ator,atualizado_em=clock_timestamp();
 UPDATE public.mimo_nuvem_oauth_estados SET finalizado_em=clock_timestamp() WHERE hash=_hash;
END $$;
CREATE FUNCTION public.mimo_nuvem_oauth_ler(_empresa uuid,_loja text,_ator uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 RETURN (SELECT token_cifrado FROM public.mimo_nuvem_credenciais WHERE empresa_id=_empresa AND loja_id=_loja);
END $$;
REVOKE ALL ON FUNCTION public.mimo_nuvem_oauth_iniciar(uuid,text,uuid,text),public.mimo_nuvem_oauth_consumir(text),public.mimo_nuvem_oauth_salvar(text,uuid,text,uuid,text),public.mimo_nuvem_oauth_ler(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_nuvem_oauth_iniciar(uuid,text,uuid,text),public.mimo_nuvem_oauth_consumir(text),public.mimo_nuvem_oauth_salvar(text,uuid,text,uuid,text),public.mimo_nuvem_oauth_ler(uuid,text,uuid) TO service_role;
