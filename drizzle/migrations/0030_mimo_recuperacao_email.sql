-- Preparada. Aplicar pelo migrador após backup compartilhado verificado.
CREATE TABLE public.mimo_email_credenciais (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id), remetente text NOT NULL,
 assunto_google text NOT NULL CHECK(length(assunto_google) BETWEEN 1 AND 255),
 refresh_cifrado text NOT NULL CHECK(refresh_cifrado ~ '^v1:[a-f0-9]{24}:[a-f0-9]+$' AND length(refresh_cifrado)<20000),
 versao uuid NOT NULL DEFAULT gen_random_uuid(), atualizado_por uuid NOT NULL REFERENCES auth.users(id),
 atualizado_em timestamptz NOT NULL DEFAULT now(), CHECK(remetente=lower(trim(remetente)) AND remetente ~ '^[^[:space:]<>]+@[^[:space:]<>]+\.[^[:space:]<>]+$')
);
CREATE TABLE public.mimo_email_config (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id), loja_id text NOT NULL,
 ativo boolean NOT NULL DEFAULT false, piloto_ok boolean NOT NULL DEFAULT false,
 inicio_em timestamptz, ator_id uuid NOT NULL REFERENCES auth.users(id),
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(empresa_id,loja_id) REFERENCES public.mimo_nuvem_lojas(empresa_id,loja_id)
);
CREATE TABLE public.mimo_email_oauth_estados (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 ator_id uuid NOT NULL REFERENCES auth.users(id), verificador_cifrado text NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(), expira_em timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 consumido_em timestamptz, finalizado_em timestamptz
);
CREATE INDEX ON public.mimo_email_oauth_estados(empresa_id,criado_em);
CREATE TABLE public.mimo_email_supressoes (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), email text NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(), motivo text NOT NULL,
 PRIMARY KEY(empresa_id,email), CHECK(email=lower(trim(email)))
);
CREATE TABLE public.mimo_email_fila (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, loja_id text NOT NULL,
 checkout_id text NOT NULL, token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 email text NOT NULL CHECK(email=lower(trim(email)) AND email ~ '^[^[:space:]<>]+@[^[:space:]<>]+\.[^[:space:]<>]+$'),
 etapa smallint NOT NULL DEFAULT 1 CHECK(etapa=1), previsto_em timestamptz NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(), estado text NOT NULL DEFAULT 'pendente'
 CHECK(estado IN ('pendente','reservada','enviando','enviada','bloqueada','incerta')),
 reserva uuid, reservado_em timestamptz, enviada_em timestamptz, message_id text, motivo text,
 solicitado_por uuid REFERENCES auth.users(id), solicitado_em timestamptz,
 credencial_versao uuid,
 UNIQUE(empresa_id,loja_id,token_hash,etapa),
 CHECK((solicitado_por IS NULL)=(solicitado_em IS NULL)),
 FOREIGN KEY(empresa_id,loja_id,checkout_id) REFERENCES public.mimo_nuvem_carrinhos(empresa_id,loja_id,checkout_id)
);
CREATE INDEX ON public.mimo_email_fila(empresa_id,previsto_em) WHERE estado='pendente';
CREATE TABLE public.mimo_email_testes (
 id uuid PRIMARY KEY, empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 ator_id uuid NOT NULL REFERENCES auth.users(id), email text NOT NULL, credencial_versao uuid NOT NULL,
 estado text NOT NULL CHECK(estado IN ('enviando','enviada','incerta')),
 criado_em timestamptz NOT NULL DEFAULT now(), message_id text
);
ALTER TABLE public.mimo_email_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_email_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_email_oauth_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_email_supressoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_email_fila ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_email_testes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_email_credenciais,public.mimo_email_config,public.mimo_email_oauth_estados,
 public.mimo_email_supressoes,public.mimo_email_fila,public.mimo_email_testes FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.mimo_email_oauth_iniciar(_empresa uuid,_ator uuid,_hash text,_verificador text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended('gmail:'||_empresa::text,0));
 IF (SELECT count(*) FROM public.mimo_email_oauth_estados WHERE ator_id=_ator AND criado_em>clock_timestamp()-interval '10 minutes')>=5 THEN RAISE EXCEPTION 'Aguarde antes de conectar novamente'; END IF;
 IF EXISTS(SELECT 1 FROM public.mimo_email_oauth_estados WHERE empresa_id=_empresa AND consumido_em IS NOT NULL AND finalizado_em IS NULL AND expira_em>clock_timestamp()) THEN RAISE EXCEPTION 'Autorização em processamento'; END IF;
 IF _verificador !~ '^v1:[a-f0-9]{24}:[a-f0-9]+$' OR length(_verificador)>20000 THEN RAISE EXCEPTION 'Verificador inválido'; END IF;
 UPDATE public.mimo_email_oauth_estados SET expira_em=clock_timestamp() WHERE empresa_id=_empresa AND finalizado_em IS NULL;
 INSERT INTO public.mimo_email_oauth_estados(hash,empresa_id,ator_id,verificador_cifrado) VALUES(_hash,_empresa,_ator,_verificador);
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_oauth_consumir(_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.mimo_email_oauth_estados;
BEGIN
 SELECT * INTO e FROM public.mimo_email_oauth_estados WHERE hash=_hash FOR UPDATE;
 IF NOT FOUND OR e.consumido_em IS NOT NULL OR e.finalizado_em IS NOT NULL OR e.expira_em<=clock_timestamp()+interval '30 seconds' THEN RAISE EXCEPTION 'Autorização inválida'; END IF;
 PERFORM public.mimo_nuvem_oauth_acesso(e.empresa_id,e.ator_id);
 UPDATE public.mimo_email_oauth_estados SET consumido_em=clock_timestamp() WHERE hash=_hash;
 RETURN jsonb_build_object('empresa',e.empresa_id,'ator',e.ator_id,'verificador',e.verificador_cifrado);
END $$;
CREATE FUNCTION public.mimo_email_oauth_falhar(_hash text,_empresa uuid,_ator uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Só a tentativa efetivamente consumida pode ser finalizada; não altera outra autorização.
 UPDATE public.mimo_email_oauth_estados SET finalizado_em=clock_timestamp(),expira_em=clock_timestamp()
 WHERE hash=_hash AND empresa_id=_empresa AND ator_id=_ator AND consumido_em IS NOT NULL AND finalizado_em IS NULL;
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_oauth_salvar(_hash text,_empresa uuid,_loja text,_ator uuid,_remetente text,_sub text,_cifrado text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.mimo_email_oauth_estados;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended('gmail:'||_empresa::text,0));
 SELECT * INTO e FROM public.mimo_email_oauth_estados WHERE hash=_hash FOR UPDATE;
 IF NOT FOUND OR e.empresa_id<>_empresa OR e.ator_id<>_ator OR e.consumido_em IS NULL OR e.finalizado_em IS NOT NULL OR e.expira_em<=clock_timestamp() THEN RAISE EXCEPTION 'Autorização inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mimo_nuvem_lojas WHERE empresa_id=_empresa AND loja_id=_loja) THEN RAISE EXCEPTION 'Loja divergente'; END IF;
 INSERT INTO public.mimo_email_credenciais(empresa_id,remetente,assunto_google,refresh_cifrado,atualizado_por)
 VALUES(_empresa,_remetente,_sub,_cifrado,_ator)
 ON CONFLICT(empresa_id) DO UPDATE SET remetente=EXCLUDED.remetente,assunto_google=EXCLUDED.assunto_google,
 refresh_cifrado=EXCLUDED.refresh_cifrado,versao=gen_random_uuid(),atualizado_por=_ator,atualizado_em=clock_timestamp();
 INSERT INTO public.mimo_email_config(empresa_id,loja_id,ator_id) VALUES(_empresa,_loja,_ator)
 ON CONFLICT(empresa_id) DO UPDATE SET ativo=false,piloto_ok=false,ator_id=_ator,atualizado_em=clock_timestamp();
 UPDATE public.mimo_email_oauth_estados SET finalizado_em=clock_timestamp() WHERE hash=_hash;
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_credencial_ler(_empresa uuid,_ator uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 RETURN (SELECT jsonb_build_object('remetente',remetente,'sub',assunto_google,'cifrado',refresh_cifrado,'versao',versao) FROM public.mimo_email_credenciais WHERE empresa_id=_empresa);
END $$;
CREATE FUNCTION public.mimo_email_painel(_empresa uuid,_ator uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 RETURN jsonb_build_object('conectado',EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=_empresa),
 'remetente',(SELECT remetente FROM public.mimo_email_credenciais WHERE empresa_id=_empresa),
 'ativo',coalesce((SELECT ativo FROM public.mimo_email_config WHERE empresa_id=_empresa),false),
 'pilotoOk',coalesce((SELECT piloto_ok FROM public.mimo_email_config WHERE empresa_id=_empresa),false),
 'inicioEm',(SELECT inicio_em FROM public.mimo_email_config WHERE empresa_id=_empresa),
 'enviadas',(SELECT count(*) FROM public.mimo_email_fila WHERE empresa_id=_empresa AND estado='enviada'),
 'pendentes',(SELECT count(*) FROM public.mimo_email_fila WHERE empresa_id=_empresa AND estado IN ('pendente','reservada','enviando')),
 'incertas',(SELECT count(*) FROM public.mimo_email_fila WHERE empresa_id=_empresa AND estado='incerta'));
END $$;
CREATE FUNCTION public.mimo_email_configurar(_empresa uuid,_ator uuid,_ativo boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_email_config;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 SELECT * INTO cfg FROM public.mimo_email_config WHERE empresa_id=_empresa FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conecte o Gmail primeiro'; END IF;
 IF _ativo AND (NOT cfg.piloto_ok OR NOT EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=_empresa)) THEN RAISE EXCEPTION 'Conclua o teste interno antes de ativar'; END IF;
 UPDATE public.mimo_email_config SET ativo=_ativo,ator_id=_ator,
 inicio_em=CASE WHEN _ativo THEN coalesce(inicio_em,clock_timestamp()) ELSE inicio_em END,atualizado_em=clock_timestamp() WHERE empresa_id=_empresa;
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_processamento(_empresa uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_email_config;
BEGIN
 SELECT * INTO cfg FROM public.mimo_email_config WHERE empresa_id=_empresa AND ativo AND piloto_ok;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,cfg.ator_id);
 RETURN jsonb_build_object('ator',cfg.ator_id,'loja',cfg.loja_id);
END $$;
CREATE FUNCTION public.mimo_email_reservar(_empresa uuid,_loja text,_ator uuid,_checkout text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_email_config; trabalho uuid; resultado jsonb;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 SELECT * INTO cfg FROM public.mimo_email_config WHERE empresa_id=_empresa AND loja_id=_loja AND piloto_ok FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF _checkout IS NULL AND (NOT cfg.ativo OR cfg.ator_id<>_ator) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=_empresa) THEN RETURN NULL; END IF;
 UPDATE public.mimo_email_fila SET estado='incerta',motivo='processamento_interrompido'
 WHERE empresa_id=_empresa AND estado IN ('reservada','enviando') AND reservado_em<clock_timestamp()-interval '5 minutes';
 INSERT INTO public.mimo_email_fila(empresa_id,loja_id,checkout_id,token_hash,email,previsto_em)
 SELECT c.empresa_id,c.loja_id,c.checkout_id,c.token_hash,lower(trim(c.email)),c.origem_updated_at+interval '2 hours'
 FROM public.mimo_nuvem_carrinhos c WHERE c.empresa_id=_empresa AND c.loja_id=_loja
 AND ((_checkout IS NULL AND c.origem_created_at>=cfg.inicio_em) OR c.checkout_id=_checkout)
 AND c.url IS NOT NULL AND c.email ~ '^[^[:space:]<>]+@[^[:space:]<>]+\.[^[:space:]<>]+$'
 AND c.origem_updated_at>clock_timestamp()-interval '30 days' AND c.origem_updated_at<=clock_timestamp()
 AND (_checkout IS NULL OR c.origem_updated_at+interval '2 hours'<=clock_timestamp())
 ON CONFLICT(empresa_id,loja_id,token_hash,etapa) DO NOTHING;
 UPDATE public.mimo_email_fila f SET estado='bloqueada',motivo='compra_ou_supressao'
 WHERE f.empresa_id=_empresa AND f.estado='pendente' AND (
 EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=f.empresa_id AND p.loja_id=f.loja_id AND p.token_hash=f.token_hash)
 OR EXISTS(SELECT 1 FROM public.mimo_email_supressoes s WHERE s.empresa_id=f.empresa_id AND s.email=f.email)
 OR EXISTS(SELECT 1 FROM public.mimo_nuvem_carrinhos c JOIN public.mimo_recuperacao_supressoes s ON s.empresa_id=c.empresa_id AND s.telefone=public.mimo_normalizar_telefone(c.telefone) WHERE c.empresa_id=f.empresa_id AND c.loja_id=f.loja_id AND c.checkout_id=f.checkout_id));
 SELECT id INTO trabalho FROM public.mimo_email_fila WHERE empresa_id=_empresa AND loja_id=_loja AND estado='pendente'
 AND previsto_em<=clock_timestamp() AND (_checkout IS NULL OR checkout_id=_checkout)
 ORDER BY previsto_em,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF trabalho IS NULL THEN RETURN NULL; END IF;
 WITH atualizado AS (UPDATE public.mimo_email_fila SET estado='reservada',reserva=gen_random_uuid(),reservado_em=clock_timestamp(),
 solicitado_por=CASE WHEN _checkout IS NOT NULL THEN _ator END,solicitado_em=CASE WHEN _checkout IS NOT NULL THEN clock_timestamp() END
 WHERE id=trabalho RETURNING *) SELECT to_jsonb(f) INTO resultado FROM atualizado f;
 RETURN resultado;
END $$;
CREATE FUNCTION public.mimo_email_autorizar(_id uuid,_reserva uuid,_versao uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.mimo_email_fila; cfg public.mimo_email_config;
BEGIN
 SELECT * INTO f FROM public.mimo_email_fila WHERE id=_id AND reserva=_reserva AND estado='reservada' FOR UPDATE;
 IF NOT FOUND THEN RETURN 'false'::jsonb; END IF;
 SELECT * INTO cfg FROM public.mimo_email_config WHERE empresa_id=f.empresa_id AND piloto_ok FOR SHARE;
 IF FOUND THEN PERFORM public.mimo_nuvem_oauth_acesso(f.empresa_id,coalesce(f.solicitado_por,cfg.ator_id)); END IF;
 IF cfg.empresa_id IS NULL OR cfg.loja_id<>f.loja_id OR (f.solicitado_por IS NULL AND NOT cfg.ativo)
 OR f.reservado_em<clock_timestamp()-interval '1 minute'
 OR NOT EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=f.empresa_id AND versao=_versao)
 OR EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=f.empresa_id AND p.loja_id=f.loja_id AND p.token_hash=f.token_hash)
 OR EXISTS(SELECT 1 FROM public.mimo_email_supressoes s WHERE s.empresa_id=f.empresa_id AND s.email=f.email)
 OR NOT EXISTS(SELECT 1 FROM public.mimo_nuvem_carrinhos c WHERE c.empresa_id=f.empresa_id AND c.loja_id=f.loja_id AND c.checkout_id=f.checkout_id
 AND c.token_hash=f.token_hash AND lower(trim(c.email))=f.email AND c.url IS NOT NULL
 AND (f.solicitado_por IS NOT NULL OR c.origem_created_at>=cfg.inicio_em)
 AND c.origem_updated_at>clock_timestamp()-interval '30 days' AND c.origem_updated_at+interval '2 hours'<=clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=c.empresa_id AND s.telefone=public.mimo_normalizar_telefone(c.telefone)))
 THEN UPDATE public.mimo_email_fila SET estado='bloqueada',motivo='verificacao_final' WHERE id=f.id; RETURN 'false'::jsonb; END IF;
 UPDATE public.mimo_email_fila SET estado='enviando',credencial_versao=_versao WHERE id=f.id;
 RETURN 'true'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_concluir(_id uuid,_reserva uuid,_estado text,_message text DEFAULT NULL,_motivo text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF _estado NOT IN ('enviada','incerta','bloqueada') OR (_estado='enviada' AND coalesce(length(_message),0) NOT BETWEEN 1 AND 300) THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
 UPDATE public.mimo_email_fila SET estado=_estado,message_id=CASE WHEN _estado='enviada' THEN _message END,
 enviada_em=CASE WHEN _estado='enviada' THEN clock_timestamp() END,motivo=left(_motivo,100)
 WHERE id=_id AND reserva=_reserva AND ((estado='enviando' AND _estado IN ('enviada','incerta')) OR (estado='reservada' AND _estado='bloqueada'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva inválida'; END IF;
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_descadastro_contexto(_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('empresa',empresa_id,'email',email) FROM public.mimo_email_fila WHERE id=_id;
$$;
CREATE FUNCTION public.mimo_email_descadastrar(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.mimo_email_fila;
BEGIN
 SELECT * INTO f FROM public.mimo_email_fila WHERE id=_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 INSERT INTO public.mimo_email_supressoes(empresa_id,email,motivo) VALUES(f.empresa_id,f.email,'descadastro') ON CONFLICT DO NOTHING;
 UPDATE public.mimo_email_fila SET estado='bloqueada',motivo='descadastro'
 WHERE empresa_id=f.empresa_id AND email=f.email AND estado IN ('pendente','reservada');
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_teste_reservar(_empresa uuid,_ator uuid,_id uuid,_email text,_versao uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended('gmail-teste:'||_empresa::text,0));
 IF EXISTS(SELECT 1 FROM public.mimo_email_testes WHERE id=_id) THEN RETURN 'false'::jsonb; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=_empresa AND versao=_versao) THEN RAISE EXCEPTION 'Reautorize o remetente'; END IF;
 IF (SELECT count(*) FROM public.mimo_email_testes WHERE empresa_id=_empresa AND criado_em>clock_timestamp()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Limite de testes atingido'; END IF;
 IF length(_email)>254 OR _email ~ '[\r\n]' OR _email !~ '^[^[:space:]<>]+@[^[:space:]<>]+\.[^[:space:]<>]+$' THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 INSERT INTO public.mimo_email_testes(id,empresa_id,ator_id,email,credencial_versao,estado) VALUES(_id,_empresa,_ator,_email,_versao,'enviando');
 RETURN 'true'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_teste_concluir(_empresa uuid,_ator uuid,_id uuid,_message text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.mimo_email_testes;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 UPDATE public.mimo_email_testes SET estado=CASE WHEN coalesce(length(_message),0) BETWEEN 1 AND 300 THEN 'enviada' ELSE 'incerta' END,message_id=_message
 WHERE id=_id AND empresa_id=_empresa AND ator_id=_ator AND estado='enviando' RETURNING * INTO t;
 IF NOT FOUND THEN RAISE EXCEPTION 'Teste inválido'; END IF;
 IF t.estado='enviada' THEN UPDATE public.mimo_email_config SET piloto_ok=true WHERE empresa_id=_empresa AND EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=_empresa AND versao=t.credencial_versao); END IF;
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION public.mimo_email_diagnostico(_empresa uuid,_ator uuid,_checkouts text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 IF coalesce(array_length(_checkouts,1),0)>30 THEN RAISE EXCEPTION 'Página inválida'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.checkout_id,'estado',x.estado,'motivo',x.motivo,
 'podeEnviar',x.motivo IN ('historico','pausada','fila'),'enviadaEm',x.enviada_em,'manual',x.solicitado_por IS NOT NULL)),'[]'::jsonb)
 INTO resultado FROM (
 SELECT c.checkout_id,f.estado,f.enviada_em,f.solicitado_por,CASE
 WHEN f.estado IN ('enviada','incerta','reservada','enviando','bloqueada') THEN f.estado
 WHEN EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=c.empresa_id AND p.loja_id=c.loja_id AND p.token_hash=c.token_hash) THEN 'compra'
 WHEN EXISTS(SELECT 1 FROM public.mimo_email_supressoes s WHERE s.empresa_id=c.empresa_id AND s.email=lower(trim(c.email)))
 OR EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=c.empresa_id AND s.telefone=public.mimo_normalizar_telefone(c.telefone)) THEN 'resposta'
 WHEN c.url IS NULL OR c.email !~ '^[^[:space:]<>]+@[^[:space:]<>]+\.[^[:space:]<>]+$' THEN 'sem_destino'
 WHEN c.origem_updated_at<=clock_timestamp()-interval '30 days' THEN 'expirado'
 WHEN c.origem_updated_at+interval '2 hours'>clock_timestamp() THEN 'aguardando'
 WHEN cfg.empresa_id IS NULL OR NOT cfg.piloto_ok OR NOT EXISTS(SELECT 1 FROM public.mimo_email_credenciais WHERE empresa_id=_empresa) THEN 'sem_configuracao'
 WHEN NOT cfg.ativo THEN 'pausada'
 WHEN c.origem_created_at<cfg.inicio_em THEN 'historico'
 ELSE 'fila' END AS motivo
 FROM public.mimo_nuvem_carrinhos c LEFT JOIN public.mimo_email_config cfg ON cfg.empresa_id=c.empresa_id AND cfg.loja_id=c.loja_id
 LEFT JOIN public.mimo_email_fila f ON f.empresa_id=c.empresa_id AND f.loja_id=c.loja_id AND f.token_hash=c.token_hash AND f.etapa=1
 WHERE c.empresa_id=_empresa AND c.checkout_id=ANY(_checkouts)) x;
 RETURN resultado;
END $$;
DO $email_grants$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'mimo_email_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $email_grants$;
