-- PREPARED ONLY. Requires the three reviewed commercial migrations first.
-- Applying this SQL does not enable any recipient, scheduler or outbound worker.
ALTER TABLE public.mimo_follow_aviso_config ADD COLUMN ativo boolean NOT NULL DEFAULT false,
 ADD COLUMN inicio_em timestamptz;

CREATE FUNCTION public.mimo_follow_aviso_config_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.vinculo_id IS DISTINCT FROM OLD.vinculo_id THEN
  NEW.ativo:=false; NEW.inicio_em:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_aviso_destino_guard BEFORE UPDATE ON public.mimo_follow_aviso_config
 FOR EACH ROW EXECUTE FUNCTION public.mimo_follow_aviso_config_guard();

-- Any saved destination configuration pauses delivery until deliberately activated again.
ALTER FUNCTION public.mimo_follow_aviso_configurar(uuid,jsonb) RENAME TO mimo_follow_aviso_configurar_base;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_configurar_base(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.mimo_follow_aviso_configurar(_empresa uuid,_dados jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v integer;
BEGIN
 v:=public.mimo_follow_aviso_configurar_base(_empresa,_dados);
 UPDATE public.mimo_follow_aviso_config SET ativo=false,inicio_em=NULL
 WHERE empresa_id=_empresa AND membro_id=(_dados->>'membro')::uuid;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_configurar(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_follow_aviso_configurar(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.mimo_follow_aviso_ativar(_empresa uuid,_membro uuid,_versao integer,_ativo boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.mimo_follow_aviso_config; v public.mimo_whatsapp_vinculos;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND OR NOT public.tem_papel_empresa(_empresa,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO c FROM public.mimo_follow_aviso_config WHERE empresa_id=_empresa AND membro_id=_membro FOR UPDATE;
 IF c.membro_id IS NULL OR c.versao<>_versao OR _ativo IS NULL THEN RAISE EXCEPTION 'Versão alterada' USING ERRCODE='40001'; END IF;
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id AND empresa_id=_empresa AND ativo FOR SHARE;
 IF _ativo AND (v.id IS NULL OR v.finalidade IS NULL
 OR NOT public.tem_papel_empresa(_empresa,_membro,ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
 OR NOT public.tem_papel_empresa(_empresa,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[])
 OR c.numero=public.mimo_normalizar_telefone(v.numero_comercial)
 OR EXISTS(SELECT 1 FROM public.mimo_leads WHERE empresa_id=_empresa AND telefone_normalizado=c.numero))
 THEN RAISE EXCEPTION 'Confira remetente e destinatário interno'; END IF;
 UPDATE public.mimo_follow_aviso_fila SET estado=CASE WHEN estado='enviando' THEN 'incerta' ELSE 'cancelada' END
 WHERE empresa_id=_empresa AND destinatario_id=_membro AND estado IN ('bloqueada','reservada','enviando');
 UPDATE public.mimo_follow_aviso_config SET ativo=_ativo,inicio_em=CASE WHEN _ativo THEN clock_timestamp() ELSE inicio_em END,
 versao=versao+1,confirmado_por=auth.uid(),confirmado_em=clock_timestamp()
 WHERE empresa_id=_empresa AND membro_id=_membro RETURNING * INTO c;
 IF _ativo THEN
  INSERT INTO public.mimo_follow_aviso_fila(empresa_id,follow_id,follow_versao,destinatario_id,config_versao,numero,vinculo_id,executar_em)
  SELECT x.empresa_id,x.id,x.versao,x.responsavel_id,c.versao,c.numero,c.vinculo_id,x.prazo
  FROM public.mimo_lead_followups x WHERE x.empresa_id=_empresa AND x.responsavel_id=_membro AND x.estado='pendente' AND x.prazo>=c.inicio_em
  ON CONFLICT(follow_id,follow_versao,destinatario_id,tipo) DO UPDATE SET
   config_versao=EXCLUDED.config_versao,numero=EXCLUDED.numero,vinculo_id=EXCLUDED.vinculo_id,
   estado='bloqueada',reserva=NULL,reservada_em=NULL,erro=NULL
  WHERE mimo_follow_aviso_fila.estado IN ('bloqueada','cancelada') AND mimo_follow_aviso_fila.message_id IS NULL;
 END IF;
 INSERT INTO public.mimo_follow_aviso_historico(empresa_id,membro_id,ator_id,acao,versao)
 VALUES(_empresa,_membro,auth.uid(),CASE WHEN _ativo THEN 'ativar' ELSE 'pausar' END,c.versao);
 RETURN c.versao;
END $$;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_ativar(uuid,uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_follow_aviso_ativar(uuid,uuid,integer,boolean) TO authenticated;

CREATE FUNCTION public.mimo_follow_aviso_elegivel(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.mimo_follow_aviso_fila q
 JOIN public.mimo_lead_followups x ON x.id=q.follow_id AND x.empresa_id=q.empresa_id
 JOIN public.mimo_follow_aviso_config c ON c.empresa_id=x.empresa_id AND c.membro_id=x.responsavel_id
 JOIN public.mimo_whatsapp_vinculos v ON v.id=c.vinculo_id AND v.empresa_id=x.empresa_id
 JOIN public.empresas e ON e.id=x.empresa_id AND e.slug='mimo' AND e.ativa
 WHERE q.id=_id AND x.estado='pendente' AND x.versao=q.follow_versao AND x.responsavel_id=q.destinatario_id
 AND c.ativo AND c.inicio_em IS NOT NULL AND x.prazo>=c.inicio_em AND x.prazo<=clock_timestamp()
 AND c.versao=q.config_versao AND c.numero=q.numero AND c.vinculo_id=q.vinculo_id
 AND v.ativo AND v.finalidade IS NOT NULL AND c.numero<>public.mimo_normalizar_telefone(v.numero_comercial)
 AND public.mimo_follow_pode_lead(x.empresa_id,x.lead_id,x.responsavel_id)
 AND public.tem_papel_empresa(x.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[])
 AND public.tem_papel_empresa(x.empresa_id,c.confirmado_por,ARRAY['administrador','gestor']::public.empresa_papel[])
 AND NOT EXISTS(SELECT 1 FROM public.mimo_leads l WHERE l.empresa_id=x.empresa_id AND l.telefone_normalizado=c.numero))
$$;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_elegivel(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.mimo_follow_aviso_reservar() RETURNS public.mimo_follow_aviso_fila
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.mimo_follow_aviso_fila;
BEGIN
 -- A send may have reached WhatsApp even if the process never recorded acceptance.
 UPDATE public.mimo_follow_aviso_fila SET estado='incerta',erro='processamento_interrompido'
 WHERE estado='enviando' AND reservada_em<clock_timestamp()-interval '5 minutes';
 -- Reserved work has not crossed the irreversible authorization/send boundary.
 UPDATE public.mimo_follow_aviso_fila SET estado='bloqueada',reserva=NULL,reservada_em=NULL
 WHERE estado='reservada' AND reservada_em<clock_timestamp()-interval '5 minutes';
 SELECT * INTO q FROM public.mimo_follow_aviso_fila WHERE estado='bloqueada'
 AND executar_em<=clock_timestamp() AND public.mimo_follow_aviso_elegivel(id)
 ORDER BY executar_em,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF q.id IS NULL THEN RETURN NULL; END IF;
 UPDATE public.mimo_follow_aviso_fila SET estado='reservada',reserva=gen_random_uuid(),reservada_em=clock_timestamp()
 WHERE id=q.id RETURNING * INTO q;
 RETURN q;
END $$;

CREATE FUNCTION public.mimo_follow_aviso_autorizar(_id uuid,_reserva uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.mimo_follow_aviso_fila;
BEGIN
 SELECT * INTO q FROM public.mimo_follow_aviso_fila WHERE id=_id;
 IF q.id IS NULL THEN RETURN false; END IF;
 -- Config -> follow-up -> queue, consistent with management pause and follow-up edits.
 PERFORM 1 FROM public.mimo_follow_aviso_config WHERE empresa_id=q.empresa_id AND membro_id=q.destinatario_id FOR SHARE;
 PERFORM 1 FROM public.empresas WHERE id=q.empresa_id FOR SHARE;
 PERFORM 1 FROM public.mimo_whatsapp_vinculos WHERE id=q.vinculo_id FOR SHARE;
 PERFORM 1 FROM public.mimo_lead_followups WHERE id=q.follow_id FOR SHARE;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=q.empresa_id ORDER BY user_id FOR SHARE;
 SELECT * INTO q FROM public.mimo_follow_aviso_fila WHERE id=_id FOR UPDATE;
 IF q.estado<>'reservada' OR q.reserva IS DISTINCT FROM _reserva OR q.reservada_em<clock_timestamp()-interval '5 minutes' THEN RETURN false; END IF;
 IF NOT public.mimo_follow_aviso_elegivel(_id) THEN
  UPDATE public.mimo_follow_aviso_fila SET estado='cancelada' WHERE id=_id; RETURN false;
 END IF;
 UPDATE public.mimo_follow_aviso_fila SET estado='enviando',reservada_em=clock_timestamp() WHERE id=_id;
 RETURN true;
END $$;

CREATE FUNCTION public.mimo_follow_aviso_finalizar(_id uuid,_reserva uuid,_aceita boolean,_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.mimo_follow_aviso_fila SET
 estado=CASE WHEN _aceita AND length(_message_id) BETWEEN 1 AND 200 THEN 'aceita' ELSE 'incerta' END,
 message_id=CASE WHEN _aceita AND length(_message_id) BETWEEN 1 AND 200 THEN _message_id ELSE message_id END,
 erro=CASE WHEN _aceita AND length(_message_id) BETWEEN 1 AND 200 THEN NULL ELSE 'aceitacao_nao_confirmada' END
 WHERE id=_id AND reserva=_reserva AND estado IN ('enviando','incerta');
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.mimo_follow_aviso_reservar(),public.mimo_follow_aviso_autorizar(uuid,uuid),public.mimo_follow_aviso_finalizar(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_follow_aviso_reservar(),public.mimo_follow_aviso_autorizar(uuid,uuid),public.mimo_follow_aviso_finalizar(uuid,uuid,boolean,text) TO service_role;
