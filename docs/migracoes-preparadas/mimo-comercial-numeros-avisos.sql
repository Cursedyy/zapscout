-- PREPARED ONLY. Requires shared-access and revised follow-up SQL first.
-- No operational numbers, historical reclassification, messages, cron or activation.
ALTER TABLE public.mimo_whatsapp_vinculos ADD COLUMN finalidade text
 CHECK(finalidade IN ('entrada','fechamento'));
-- Existing binding purpose stays NULL until administrator explicitly confirms it.
ALTER TABLE public.uazapi_instancias DROP CONSTRAINT uazapi_instancias_tipo_check;
ALTER TABLE public.uazapi_instancias ADD CONSTRAINT uazapi_instancias_tipo_check
 CHECK(tipo IN ('prospeccao','secundaria','comercial_1','comercial_2','comercial_3'));

CREATE FUNCTION public.mimo_comercial_auxiliar_reservar(_empresa uuid,_ator uuid,_slot text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.uazapi_instancias;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel::text='administrador' FOR SHARE;
 IF NOT FOUND OR _slot NOT IN ('comercial_1','comercial_2','comercial_3') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_ator::text||_slot,0));
 SELECT * INTO i FROM public.uazapi_instancias WHERE user_id=_ator AND tipo=_slot FOR UPDATE;
 IF i.id IS NOT NULL THEN RETURN jsonb_build_object('id',i.id,'criada',false); END IF;
 INSERT INTO public.uazapi_instancias(user_id,tipo,nome,status) VALUES(_ator,_slot,_slot,'criacao_incerta') RETURNING * INTO i;
 RETURN jsonb_build_object('id',i.id,'criada',true);
END $$;
REVOKE ALL ON FUNCTION public.mimo_comercial_auxiliar_reservar(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_comercial_auxiliar_reservar(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.mimo_comercial_vincular(_empresa uuid,_ator uuid,_instancia uuid,_hash text,_numero text,_finalidade text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.uazapi_instancias; v public.mimo_whatsapp_vinculos; tok text;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel::text='administrador' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _numero !~ '^[0-9]{12,15}$' OR _hash !~ '^[a-f0-9]{64}$' OR _finalidade NOT IN ('entrada','fechamento') THEN RAISE EXCEPTION 'Identidade inválida'; END IF;
 -- PostgreSQL built-in SHA-256 verifies current source credential; no extension required.
 IF _instancia IS NULL THEN
  SELECT uazapi_instance_token INTO tok FROM public.profiles WHERE id=_ator FOR SHARE;
  IF EXISTS(SELECT 1 FROM public.uazapi_instancias WHERE token=tok) OR (SELECT count(*) FROM public.profiles WHERE uazapi_instance_token=tok)<>1 THEN RAISE EXCEPTION 'Identidade ambígua'; END IF;
 ELSE
  SELECT * INTO i FROM public.uazapi_instancias WHERE id=_instancia AND user_id=_ator FOR UPDATE;
  tok:=i.token;
  IF i.id IS NULL OR EXISTS(SELECT 1 FROM public.profiles WHERE uazapi_instance_token=tok) OR (SELECT count(*) FROM public.uazapi_instancias WHERE token=tok)<>1 THEN RAISE EXCEPTION 'Identidade ambígua'; END IF;
 END IF;
 IF tok IS NULL OR encode(sha256(convert_to(tok,'UTF8')),'hex')<>_hash THEN RAISE EXCEPTION 'Credencial mudou'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text,0));
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE token_sha256=_hash FOR UPDATE;
 IF v.id IS NOT NULL AND (v.empresa_id<>_empresa OR v.owner_id<>_ator OR v.instancia_id IS DISTINCT FROM _instancia OR public.mimo_normalizar_telefone(v.numero_comercial)<>_numero) THEN RAISE EXCEPTION 'Vínculo diferente'; END IF;
 IF EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE empresa_id=_empresa AND ativo AND numero_comercial=_numero AND id IS DISTINCT FROM v.id) THEN RAISE EXCEPTION 'Número já vinculado'; END IF;
 IF v.ativo AND v.finalidade IS NOT NULL AND v.finalidade<>_finalidade THEN RAISE EXCEPTION 'Pause antes de mudar a finalidade'; END IF;
 IF v.id IS NULL THEN
  INSERT INTO public.mimo_whatsapp_vinculos(empresa_id,owner_id,instancia_id,numero_comercial,token_sha256,finalidade,ativo,confirmado_por)
  VALUES(_empresa,_ator,_instancia,_numero,_hash,_finalidade,true,_ator) RETURNING id INTO v.id;
 ELSE
  UPDATE public.mimo_whatsapp_vinculos SET finalidade=_finalidade,ativo=true,confirmado_por=_ator,confirmado_em=clock_timestamp() WHERE id=v.id;
 END IF;
 INSERT INTO public.mimo_whatsapp_diagnosticos(empresa_id,vinculo_id,codigo) VALUES(_empresa,v.id,'finalidade_confirmada_'||_finalidade);
 RETURN v.id;
END $$;
REVOKE ALL ON FUNCTION public.mimo_comercial_vincular(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_comercial_vincular(uuid,uuid,uuid,text,text,text) TO service_role;

-- Replace commercial core only; the existing wrapper/pilot and personal webhook interception remain.
CREATE OR REPLACE FUNCTION public.mimo_receber_whatsapp_comercial(_vinculo uuid,_owner uuid,_token_sha256 text,_message_id text,_telefone text,_nome text,_texto text,_contato_em timestamptz,_from_me boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.mimo_whatsapp_vinculos; n text; l uuid; evento uuid;
BEGIN
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND ativo AND owner_id=_owner AND token_sha256=_token_sha256 FOR UPDATE;
 IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=v.empresa_id AND slug='mimo' AND ativa)
 OR NOT public.tem_papel_empresa(v.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 IF coalesce(length(_message_id),0) NOT BETWEEN 1 AND 200 OR _texto IS NULL OR length(_texto)>10000 OR _contato_em IS NULL OR NOT isfinite(_contato_em) OR _contato_em>now()+interval '5 minutes' OR _from_me IS NULL THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 n:=public.mimo_normalizar_telefone(_telefone);
 IF n IS NULL OR n=public.mimo_normalizar_telefone(v.numero_comercial) THEN RETURN NULL; END IF;
 -- Serializes the same canonical contact across all commercial numbers.
 PERFORM pg_advisory_xact_lock(hashtextextended(v.empresa_id::text||n,0));
 INSERT INTO public.mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,direcao,texto,contato_em)
 VALUES(v.empresa_id,v.id,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_texto,_contato_em)
 ON CONFLICT(vinculo_id,message_id) DO NOTHING RETURNING id INTO evento;
 IF evento IS NULL THEN SELECT lead_id INTO l FROM public.mimo_whatsapp_eventos WHERE vinculo_id=v.id AND message_id=_message_id; RETURN l; END IF;
 SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND telefone_normalizado=n FOR UPDATE;
 -- Unclassified existing bindings keep their previously authorized entry semantics until reviewed.
 -- Every new binding has explicit purpose; closing NEVER creates a lead, even with ad evidence.
 IF NOT _from_me AND l IS NULL AND (v.finalidade='entrada' OR v.finalidade IS NULL) THEN
  INSERT INTO public.mimo_leads(empresa_id,nome_empresa,nome_contato,telefone,origem,entrada_em,created_by,primeiro_contato_whatsapp_em,ultimo_contato_whatsapp_em)
  VALUES(v.empresa_id,coalesce(nullif(left(btrim(_nome),200),''),n),coalesce(left(_nome,200),''),n,'whatsapp',_contato_em,v.confirmado_por,_contato_em,_contato_em)
  ON CONFLICT(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL DO UPDATE SET
  primeiro_contato_whatsapp_em=least(public.mimo_leads.primeiro_contato_whatsapp_em,EXCLUDED.primeiro_contato_whatsapp_em),ultimo_contato_whatsapp_em=greatest(public.mimo_leads.ultimo_contato_whatsapp_em,EXCLUDED.ultimo_contato_whatsapp_em) RETURNING id INTO l;
 ELSIF l IS NOT NULL THEN
  UPDATE public.mimo_leads SET primeiro_contato_whatsapp_em=least(primeiro_contato_whatsapp_em,_contato_em),ultimo_contato_whatsapp_em=greatest(ultimo_contato_whatsapp_em,_contato_em) WHERE id=l;
 END IF;
 UPDATE public.mimo_whatsapp_eventos SET lead_id=l WHERE id=evento;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.mimo_receber_whatsapp_comercial(uuid,uuid,text,text,text,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Trigger runs when the EXISTING authenticated wrapper persists its allowlisted evidence.
CREATE FUNCTION public.mimo_comercial_atribuir() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.mimo_leads; finalidade_n text;
BEGIN
 IF NEW.referencia_anuncio IS NULL OR OLD.referencia_anuncio IS NOT NULL OR NEW.lead_id IS NULL OR NEW.direcao<>'recebida' THEN RETURN NEW; END IF;
 SELECT finalidade INTO finalidade_n FROM public.mimo_whatsapp_vinculos WHERE id=NEW.vinculo_id;
 IF finalidade_n IS DISTINCT FROM 'entrada' THEN RETURN NEW; END IF;
 IF NEW.referencia_anuncio->>'fonte'<>'metadado_whatsapp' OR coalesce(length(NEW.referencia_anuncio->>'id'),0) NOT BETWEEN 1 AND 200
 OR NEW.referencia_anuncio->>'url' !~ '^https://([a-zA-Z0-9-]+\.)*(facebook\.com|instagram\.com|fb\.me)/' THEN RETURN NEW; END IF;
 SELECT * INTO l FROM public.mimo_leads WHERE id=NEW.lead_id AND empresa_id=NEW.empresa_id FOR UPDATE;
 -- Only the new contact's first event; manual attribution/history is never overwritten.
 IF l.origem='whatsapp' AND l.campanha_origem='' AND l.anuncio_origem='' AND l.entrada_em=NEW.contato_em
 AND l.created_at>=NEW.created_at AND NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_eventos WHERE empresa_id=NEW.empresa_id AND lead_id=l.id AND id<>NEW.id) THEN
  UPDATE public.mimo_leads SET origem='meta_ads',anuncio_origem=NEW.referencia_anuncio->>'id' WHERE id=l.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_comercial_atribuir AFTER UPDATE OF referencia_anuncio ON public.mimo_whatsapp_eventos FOR EACH ROW EXECUTE FUNCTION public.mimo_comercial_atribuir();

CREATE TABLE public.mimo_follow_aviso_config(
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),membro_id uuid NOT NULL,
 vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id),numero text NOT NULL CHECK(numero ~ '^[0-9]{12,15}$'),
 versao integer NOT NULL DEFAULT 1,confirmado_por uuid NOT NULL,confirmado_em timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(empresa_id,membro_id)
);
GRANT SELECT ON public.mimo_follow_aviso_config TO authenticated;
GRANT ALL ON public.mimo_follow_aviso_config TO service_role;
ALTER TABLE public.mimo_follow_aviso_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_aviso_config_read ON public.mimo_follow_aviso_config FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE TABLE public.mimo_follow_aviso_fila(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 follow_id uuid NOT NULL REFERENCES public.mimo_lead_followups(id),follow_versao integer NOT NULL,
 destinatario_id uuid NOT NULL,tipo text NOT NULL DEFAULT 'prazo' CHECK(tipo='prazo'),
 config_versao integer NOT NULL,numero text NOT NULL,vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id),
 executar_em timestamptz NOT NULL,estado text NOT NULL DEFAULT 'bloqueada' CHECK(estado IN ('bloqueada','cancelada','reservada','enviando','aceita','incerta','falha')),
 reserva uuid,reservada_em timestamptz,message_id text,erro text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(follow_id,follow_versao,destinatario_id,tipo)
);
GRANT SELECT ON public.mimo_follow_aviso_fila TO authenticated;
GRANT ALL ON public.mimo_follow_aviso_fila TO service_role;
ALTER TABLE public.mimo_follow_aviso_fila ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_aviso_fila_read ON public.mimo_follow_aviso_fila FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) OR
 (destinatario_id=auth.uid() AND public.mimo_follow_pode_lead(empresa_id,(SELECT lead_id FROM public.mimo_lead_followups WHERE id=follow_id),auth.uid())));
CREATE INDEX mimo_aviso_fila_prazo ON public.mimo_follow_aviso_fila(empresa_id,executar_em) WHERE estado='bloqueada';
CREATE TABLE public.mimo_follow_aviso_historico(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),membro_id uuid NOT NULL,
 ator_id uuid NOT NULL,acao text NOT NULL,versao integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mimo_follow_aviso_historico TO authenticated;
GRANT ALL ON public.mimo_follow_aviso_historico TO service_role;
ALTER TABLE public.mimo_follow_aviso_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_aviso_hist_read ON public.mimo_follow_aviso_historico FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE TRIGGER mimo_aviso_hist_imutavel BEFORE UPDATE OR DELETE ON public.mimo_follow_aviso_historico FOR EACH ROW EXECUTE FUNCTION public.mimo_follow_history_imutavel();
CREATE FUNCTION public.mimo_follow_aviso_configurar(_empresa uuid,_dados jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE membro uuid:=(_dados->>'membro')::uuid; vinculo uuid:=(_dados->>'vinculo')::uuid; n text:=_dados->>'numero'; v integer;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=auth.uid() AND ativo AND papel::text IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=membro AND ativo AND papel::text IN ('administrador','gestor','vendedor') FOR SHARE;
 IF NOT FOUND OR coalesce((_dados->>'confirmado')::boolean,false)=false OR n !~ '^[0-9]{12,15}$' THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 PERFORM 1 FROM public.mimo_whatsapp_vinculos WHERE id=vinculo AND empresa_id=_empresa AND ativo AND finalidade IS NOT NULL AND public.tem_papel_empresa(_empresa,confirmado_por,ARRAY['administrador']::public.empresa_papel[]) FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.mimo_leads WHERE empresa_id=_empresa AND telefone_normalizado=n)
 OR EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE empresa_id=_empresa AND numero_comercial=n) THEN RAISE EXCEPTION 'Número interno não confirmado ou coincide com cliente/remetente'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text||membro::text,0));
 SELECT versao INTO v FROM public.mimo_follow_aviso_config WHERE empresa_id=_empresa AND membro_id=membro FOR UPDATE;
 IF coalesce(v,0) IS DISTINCT FROM (_dados->>'versao')::int THEN RAISE EXCEPTION 'Versão alterada' USING ERRCODE='40001'; END IF;
 INSERT INTO public.mimo_follow_aviso_config(empresa_id,membro_id,vinculo_id,numero,confirmado_por,versao)
 VALUES(_empresa,membro,vinculo,n,auth.uid(),coalesce(v,0)+1)
 ON CONFLICT(empresa_id,membro_id) DO UPDATE SET vinculo_id=EXCLUDED.vinculo_id,numero=EXCLUDED.numero,confirmado_por=EXCLUDED.confirmado_por,confirmado_em=clock_timestamp(),versao=EXCLUDED.versao;
 UPDATE public.mimo_follow_aviso_fila SET estado=CASE WHEN estado='enviando' THEN 'incerta' ELSE 'cancelada' END WHERE empresa_id=_empresa AND destinatario_id=membro AND estado IN ('bloqueada','reservada','enviando');
 INSERT INTO public.mimo_follow_aviso_historico(empresa_id,membro_id,ator_id,acao,versao) VALUES(_empresa,membro,auth.uid(),'configurar',coalesce(v,0)+1);
 RETURN coalesce(v,0)+1;
END $$;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_configurar(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_follow_aviso_configurar(uuid,jsonb) TO authenticated;
CREATE FUNCTION public.mimo_follow_aviso_sincronizar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.mimo_follow_aviso_config;
BEGIN
 UPDATE public.mimo_follow_aviso_fila SET estado=CASE WHEN estado='enviando' THEN 'incerta' ELSE 'cancelada' END
 WHERE follow_id=NEW.id AND estado IN ('bloqueada','reservada','enviando') AND (follow_versao<>NEW.versao OR NEW.estado<>'pendente');
 IF NEW.estado='pendente' THEN
  SELECT * INTO c FROM public.mimo_follow_aviso_config WHERE empresa_id=NEW.empresa_id AND membro_id=NEW.responsavel_id;
  IF c.membro_id IS NOT NULL THEN
   INSERT INTO public.mimo_follow_aviso_fila(empresa_id,follow_id,follow_versao,destinatario_id,config_versao,numero,vinculo_id,executar_em)
   VALUES(NEW.empresa_id,NEW.id,NEW.versao,NEW.responsavel_id,c.versao,c.numero,c.vinculo_id,NEW.prazo) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_follow_aviso_sync AFTER INSERT OR UPDATE ON public.mimo_lead_followups FOR EACH ROW EXECUTE FUNCTION public.mimo_follow_aviso_sincronizar();
-- Immutable kill-switch: no reserve/authorize/send RPC or worker exists in this slice.
CREATE FUNCTION public.mimo_follow_aviso_precheck(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.mimo_follow_aviso_fila; ok boolean;
BEGIN
 SELECT * INTO f FROM public.mimo_follow_aviso_fila WHERE id=_id FOR UPDATE;
 SELECT EXISTS(SELECT 1 FROM public.mimo_lead_followups x JOIN public.mimo_follow_aviso_config c ON c.empresa_id=x.empresa_id AND c.membro_id=x.responsavel_id
 JOIN public.mimo_whatsapp_vinculos v ON v.id=c.vinculo_id
 WHERE x.id=f.follow_id AND x.estado='pendente' AND x.versao=f.follow_versao AND x.responsavel_id=f.destinatario_id
 AND c.versao=f.config_versao AND c.numero=f.numero AND v.id=f.vinculo_id AND v.ativo AND v.finalidade IS NOT NULL
 AND public.mimo_follow_pode_lead(x.empresa_id,x.lead_id,x.responsavel_id)
 AND public.tem_papel_empresa(x.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[])
 AND public.tem_papel_empresa(x.empresa_id,c.confirmado_por,ARRAY['administrador','gestor']::public.empresa_papel[])
 AND NOT EXISTS(SELECT 1 FROM public.mimo_leads l WHERE l.empresa_id=x.empresa_id AND l.telefone_normalizado=c.numero)) INTO ok;
 IF NOT coalesce(ok,false) AND f.estado IN ('bloqueada','reservada') THEN UPDATE public.mimo_follow_aviso_fila SET estado='cancelada' WHERE id=f.id; END IF;
 RETURN jsonb_build_object('elegivel',coalesce(ok,false),'envioAutorizado',false,'motivo','ativacao_pendente');
END $$;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_precheck(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_follow_aviso_precheck(uuid) TO service_role;

-- Current canonical orders + immutable first confirmation, projected without costs/documents.
CREATE VIEW public.mimo_pedidos_conversao WITH(security_barrier=true) AS
 SELECT p.id,p.empresa_id,p.lead_id,p.status,p.total,
 (SELECT min(v.created_at) FROM public.mimo_tira_versoes v WHERE v.empresa_id=p.empresa_id AND v.pedido_id=p.id AND v.snapshot->>'status' IN ('confirmado','faturado','enviado','entregue')) AS primeira_confirmacao
 FROM public.mimo_tira_pedidos p WHERE public.pode_ver_mimo_lead(p.lead_id,auth.uid());
GRANT SELECT ON public.mimo_pedidos_conversao TO authenticated;
CREATE FUNCTION public.mimo_comercial_capacidade(_empresa uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) OR NOT public.is_membro_empresa(_empresa,auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN 2;
END $$;
REVOKE ALL ON FUNCTION public.mimo_comercial_capacidade(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_comercial_capacidade(uuid) TO authenticated;