-- Durable notification of an accepted AI handoff; qualification remains independent.
ALTER TABLE public.mimo_agente_alertas
 ADD COLUMN encaminhamento_fila_id uuid UNIQUE REFERENCES public.mimo_agente_fila(id),
 ADD COLUMN encaminhamento jsonb;
ALTER TABLE public.mimo_agente_alertas ADD CONSTRAINT mimo_encaminhamento_contexto CHECK (
 (encaminhamento_fila_id IS NULL AND encaminhamento IS NULL) OR
 (encaminhamento_fila_id IS NOT NULL AND tipo='lead' AND encaminhamento IS NOT NULL AND jsonb_typeof(encaminhamento)='object'));
CREATE FUNCTION public.mimo_agente_encaminhar_grupo(_fila uuid,_recuperar boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.mimo_agente_fila; cv public.mimo_agente_conversas; cfg public.mimo_agente_observacao_config; aviso uuid; relatos jsonb;
BEGIN
 SELECT * INTO f FROM public.mimo_agente_fila WHERE id=_fila;
 IF f.id IS NULL OR f.estado<>'enviada' OR f.message_id IS NULL OR f.solicitado_por IS NOT NULL
  OR f.resultado->>'estado' IS DISTINCT FROM 'humano' THEN RETURN NULL; END IF;
 SELECT * INTO cv FROM public.mimo_agente_conversas WHERE id=f.conversa_id AND empresa_id=f.empresa_id;
 IF cv.id IS NULL OR cv.piloto OR cv.lead_id IS NULL OR cv.estado='bloqueada' THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.mimo_agente_observacao_config WHERE empresa_id=f.empresa_id FOR SHARE;
 IF cfg.empresa_id IS NULL OR cfg.grupo_jid IS DISTINCT FROM cfg.destino OR cfg.grupo_jid IS NULL
  OR cv.vinculo_id<>cfg.vinculo_id OR (NOT _recuperar AND f.updated_at<cfg.inicio_em)
  OR f.updated_at<clock_timestamp()-interval '1 day' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(f.empresa_id::text||':'||cv.lead_id::text,0));
 SELECT id INTO aviso FROM public.mimo_agente_alertas WHERE encaminhamento_fila_id=f.id;
 IF aviso IS NOT NULL THEN RETURN aviso; END IF;
 -- Do not repeat a notice whose transport already started, succeeded or is ambiguous.
 SELECT id INTO aviso FROM public.mimo_agente_alertas WHERE empresa_id=f.empresa_id AND lead_id=cv.lead_id AND tipo='lead'
  AND (estado IN ('enviando','aceita','incerta') OR (encaminhamento_fila_id IS NOT NULL AND estado IN ('pendente','reservada'))) AND created_at>clock_timestamp()-interval '24 hours' ORDER BY created_at DESC LIMIT 1;
 IF aviso IS NOT NULL THEN RETURN aviso; END IF;
 UPDATE public.mimo_agente_alertas SET estado='cancelada' WHERE empresa_id=f.empresa_id AND lead_id=cv.lead_id
  AND tipo='lead' AND estado IN ('pendente','reservada') AND encaminhamento_fila_id IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('evento',r.evento,'trecho',r.trecho) ORDER BY r.ord),'[]') INTO relatos FROM (
  SELECT id::text evento,left(texto,220) trecho,0 ord FROM public.mimo_whatsapp_eventos
  WHERE empresa_id=f.empresa_id AND lead_id=cv.lead_id AND direcao='recebida' AND created_at<=f.updated_at
   AND btrim(texto)<>'' AND texto !~* '^(ok|sim|obrigad[oa]|claro)[.! ]*$'
  ORDER BY created_at DESC,id DESC LIMIT 1
 ) r;
 SELECT relatos||coalesce(jsonb_agg(jsonb_build_object('evento',f.id::text,'trecho',left(value->>'evidencia',220))),'[]') INTO relatos
 FROM jsonb_each(CASE WHEN jsonb_typeof(f.resultado->'dados')='object' THEN f.resultado->'dados' ELSE '{}'::jsonb END)
 WHERE coalesce(value->>'evidencia','')<>'';
 INSERT INTO public.mimo_agente_alertas(empresa_id,lead_id,tipo,config_versao,sequencia,destino,vinculo_id,encaminhamento_fila_id,encaminhamento)
 VALUES(f.empresa_id,cv.lead_id,'lead',cfg.versao,-f.sequencia,cfg.destino,cfg.vinculo_id,f.id,
  jsonb_build_object('quente',false,'motivos',jsonb_build_array('encaminhamento_equipe'),'evidencias',relatos))
 ON CONFLICT DO NOTHING RETURNING id INTO aviso;
 IF aviso IS NOT NULL THEN
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados) VALUES(f.empresa_id,cv.id,'encaminhamento_grupo_enfileirado',jsonb_build_object('fila',f.id,'alerta',aviso,'recuperacao',_recuperar));
 END IF;
 RETURN aviso;
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_encaminhar_grupo(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_encaminhar_grupo(uuid,boolean) TO service_role;
CREATE FUNCTION public.mimo_agente_encaminhamento_aceito() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.estado='enviada' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
  PERFORM public.mimo_agente_encaminhar_grupo(NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_encaminhamento_aceito() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mimo_agente_encaminhamento_aceito AFTER UPDATE OF estado ON public.mimo_agente_fila FOR EACH ROW EXECUTE FUNCTION public.mimo_agente_encaminhamento_aceito();
CREATE OR REPLACE FUNCTION public.mimo_observar_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.mimo_agente_observacao_config;
BEGIN
 IF NEW.lead_id IS NULL OR OLD.lead_id IS NOT NULL OR NEW.direcao<>'recebida' THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.mimo_agente_observacao_config WHERE empresa_id=NEW.empresa_id AND ativo FOR SHARE;
 IF c.empresa_id IS NULL OR NEW.contato_em<c.inicio_em OR NEW.contato_em<clock_timestamp()-interval '1 day' THEN RETURN NEW; END IF;
 INSERT INTO public.mimo_agente_analises(empresa_id,lead_id,evento_id,executar_em)
 VALUES(NEW.empresa_id,NEW.lead_id,NEW.id,clock_timestamp()+interval '20 seconds')
 ON CONFLICT(empresa_id,lead_id) DO UPDATE SET evento_id=EXCLUDED.evento_id,sequencia=mimo_agente_analises.sequencia+1,
 estado='pendente',executar_em=EXCLUDED.executar_em,reserva=NULL,reservada_em=NULL
 WHERE mimo_agente_analises.evento_id<>EXCLUDED.evento_id;
 UPDATE public.mimo_agente_alertas SET estado='cancelada' WHERE empresa_id=NEW.empresa_id AND lead_id=NEW.lead_id AND estado IN ('pendente','reservada') AND encaminhamento_fila_id IS NULL;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.mimo_quentes_operar(_acao text, _p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e uuid; ator uuid; c public.mimo_agente_observacao_config; v public.mimo_whatsapp_vinculos;
 a public.mimo_agente_analises; n public.mimo_agente_alertas; l public.mimo_leads; sinal public.mimo_agente_sinais;
 dados jsonb; msgs jsonb; quente_n boolean;
BEGIN
 IF _acao IN ('configurar','teste','ativar','pausar','aprendizado') THEN
  e:=(_p->>'empresa')::uuid;ator:=(_p->>'ator')::uuid;
  PERFORM 1 FROM public.empresas WHERE id=e AND slug='mimo' AND ativa FOR SHARE;
  IF NOT FOUND OR NOT public.tem_papel_empresa(e,ator,ARRAY['administrador','gestor']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  PERFORM 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=ator AND ativo FOR SHARE;
  SELECT * INTO c FROM public.mimo_agente_observacao_config WHERE empresa_id=e FOR UPDATE;
  IF _acao='configurar' THEN
   IF coalesce(_p->>'destino','') !~ '^[1-9][0-9]{11,14}$' THEN RAISE EXCEPTION 'Destino inválido'; END IF;
   SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE empresa_id=e AND id=(_p->>'vinculo')::uuid AND ativo FOR SHARE;
   IF v.id IS NULL OR NOT public.tem_papel_empresa(e,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) OR public.mimo_normalizar_telefone(v.numero_comercial)=_p->>'destino' THEN RAISE EXCEPTION 'Remetente inválido'; END IF;
   IF coalesce(c.versao,0) IS DISTINCT FROM (_p->>'versao')::int THEN RAISE EXCEPTION 'Versão alterada' USING ERRCODE='40001'; END IF;
   UPDATE public.mimo_agente_alertas SET estado=CASE WHEN estado='enviando' THEN 'incerta' ELSE 'cancelada' END WHERE empresa_id=e AND estado IN ('pendente','reservada','enviando');
   INSERT INTO public.mimo_agente_observacao_config(empresa_id,vinculo_id,destino,atualizado_por)
   VALUES(e,v.id,_p->>'destino',ator)
   ON CONFLICT(empresa_id) DO UPDATE SET vinculo_id=EXCLUDED.vinculo_id,destino=EXCLUDED.destino,ativo=false,inicio_em=clock_timestamp(),versao=mimo_agente_observacao_config.versao+1,atualizado_por=ator,atualizado_em=clock_timestamp() RETURNING * INTO c;
  ELSIF _acao='aprendizado' THEN
   IF coalesce(jsonb_typeof(_p->'perfil'),'')<>'object' OR length((_p->'perfil')::text)>20000 OR coalesce(jsonb_typeof(_p->'estatisticas'),'')<>'object' THEN RAISE EXCEPTION 'Perfil inválido'; END IF;
   INSERT INTO public.mimo_agente_aprendizado(empresa_id,perfil,estatisticas,ator_id,config_revisao)
   VALUES(e,_p->'perfil',_p->'estatisticas',ator,(_p->>'revisao')::int);
  ELSE
   IF c.empresa_id IS NULL OR c.versao IS DISTINCT FROM (_p->>'versao')::int THEN RAISE EXCEPTION 'Recarregue a configuração'; END IF;
   IF _acao='teste' THEN
    INSERT INTO public.mimo_agente_alertas(empresa_id,tipo,config_versao,destino,vinculo_id)
    VALUES(e,'teste',c.versao,c.destino,c.vinculo_id) ON CONFLICT DO NOTHING;
   ELSIF _acao='ativar' THEN
    IF NOT EXISTS(SELECT 1 FROM public.mimo_agente_alertas WHERE empresa_id=e AND tipo='teste' AND config_versao=c.versao AND estado='aceita') THEN RAISE EXCEPTION 'Confirme primeiro um aviso interno de teste'; END IF;
    UPDATE public.mimo_agente_observacao_config SET ativo=true,inicio_em=clock_timestamp(),atualizado_por=ator WHERE empresa_id=e RETURNING * INTO c;
   ELSE
    UPDATE public.mimo_agente_observacao_config SET ativo=false,atualizado_por=ator WHERE empresa_id=e RETURNING * INTO c;
    UPDATE public.mimo_agente_alertas SET estado=CASE WHEN estado='enviando' THEN 'incerta' ELSE 'cancelada' END WHERE empresa_id=e AND estado IN ('pendente','reservada','enviando');
   END IF;
  END IF;
  INSERT INTO public.mimo_agente_historico(empresa_id,ator_id,acao,dados) VALUES(e,ator,'observacao_'||_acao,jsonb_build_object('destinoConfigurado',c.empresa_id IS NOT NULL,'versao',c.versao));
  RETURN to_jsonb(c);
 ELSIF _acao='reservar_analise' THEN
  UPDATE public.mimo_agente_analises SET estado='pendente',reserva=NULL WHERE estado='reservada' AND reservada_em<clock_timestamp()-interval '3 minutes';
  SELECT x.* INTO a FROM public.mimo_agente_analises x JOIN public.mimo_agente_observacao_config cf ON cf.empresa_id=x.empresa_id AND cf.ativo
  WHERE x.estado='pendente' AND x.executar_em<=clock_timestamp() ORDER BY x.executar_em FOR UPDATE OF x SKIP LOCKED LIMIT 1;
  IF a.lead_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.mimo_agente_analises SET estado='reservada',reserva=gen_random_uuid(),reservada_em=clock_timestamp() WHERE empresa_id=a.empresa_id AND lead_id=a.lead_id RETURNING * INTO a;
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.contato_em,m.id),'[]') INTO msgs FROM(
   SELECT id,direcao,left(texto,2000) texto,contato_em FROM public.mimo_whatsapp_eventos
   WHERE empresa_id=a.empresa_id AND lead_id=a.lead_id ORDER BY contato_em DESC,id DESC LIMIT 40
  ) m;
  RETURN to_jsonb(a)||jsonb_build_object('mensagens',msgs);
 ELSIF _acao='registrar_sinal' THEN
  SELECT * INTO c FROM public.mimo_agente_observacao_config WHERE empresa_id=(_p->>'empresa_id')::uuid AND ativo FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended(c.empresa_id::text||':'||(_p->>'lead_id'),0));
  SELECT * INTO a FROM public.mimo_agente_analises WHERE empresa_id=c.empresa_id AND lead_id=(_p->>'lead_id')::uuid FOR UPDATE;
  IF a.lead_id IS NULL OR a.reserva IS DISTINCT FROM (_p->>'reserva')::uuid OR a.sequencia IS DISTINCT FROM (_p->>'sequencia')::int OR a.estado<>'reservada' THEN RETURN 'false'::jsonb; END IF;
  quente_n:=(_p->>'quente')::boolean;
  IF quente_n IS NULL OR coalesce(jsonb_typeof(_p->'motivos'),'')<>'array' OR coalesce(jsonb_typeof(_p->'evidencias'),'')<>'array' OR length((_p->'evidencias')::text)>3000 THEN RAISE EXCEPTION 'Sinal inválido'; END IF;
  INSERT INTO public.mimo_agente_sinais(empresa_id,lead_id,evento_id,sequencia,quente,motivos,evidencias)
  VALUES(a.empresa_id,a.lead_id,a.evento_id,a.sequencia,quente_n,_p->'motivos',_p->'evidencias')
  ON CONFLICT(empresa_id,lead_id) DO UPDATE SET evento_id=EXCLUDED.evento_id,sequencia=EXCLUDED.sequencia,quente=EXCLUDED.quente,motivos=EXCLUDED.motivos,evidencias=EXCLUDED.evidencias,updated_at=clock_timestamp();
  UPDATE public.mimo_agente_analises SET estado='concluida' WHERE empresa_id=a.empresa_id AND lead_id=a.lead_id;
  IF quente_n AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_alertas WHERE empresa_id=a.empresa_id AND lead_id=a.lead_id AND estado IN ('pendente','reservada','enviando','aceita','incerta') AND created_at>clock_timestamp()-interval '24 hours') THEN
   INSERT INTO public.mimo_agente_alertas(empresa_id,lead_id,tipo,config_versao,sequencia,destino,vinculo_id)
   VALUES(a.empresa_id,a.lead_id,'lead',c.versao,a.sequencia,c.destino,c.vinculo_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN 'true'::jsonb;
 ELSIF _acao='reservar_alerta' THEN
  UPDATE public.mimo_agente_alertas SET estado='incerta',erro='processamento_interrompido' WHERE estado='enviando' AND reservada_em<clock_timestamp()-interval '3 minutes';
  UPDATE public.mimo_agente_alertas SET estado='pendente',reserva=NULL WHERE estado='reservada' AND reservada_em<clock_timestamp()-interval '3 minutes';
  SELECT x.* INTO n FROM public.mimo_agente_alertas x JOIN public.mimo_agente_observacao_config cf ON cf.empresa_id=x.empresa_id AND cf.versao=x.config_versao AND cf.destino=x.destino AND cf.vinculo_id=x.vinculo_id
  WHERE x.estado='pendente' AND (cf.ativo OR x.tipo='teste') ORDER BY x.created_at FOR UPDATE OF x SKIP LOCKED LIMIT 1;
  IF n.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.mimo_agente_alertas SET estado='reservada',reserva=gen_random_uuid(),reservada_em=clock_timestamp() WHERE id=n.id RETURNING * INTO n;
  SELECT * INTO l FROM public.mimo_leads WHERE id=n.lead_id AND empresa_id=n.empresa_id;
  SELECT * INTO sinal FROM public.mimo_agente_sinais WHERE empresa_id=n.empresa_id AND lead_id=n.lead_id;
  RETURN to_jsonb(n)||jsonb_build_object('nome',l.nome_empresa,'telefone',l.telefone_normalizado,'sinal',CASE WHEN n.encaminhamento_fila_id IS NOT NULL THEN n.encaminhamento ELSE to_jsonb(sinal) END);
 ELSIF _acao='autorizar_alerta' THEN
  SELECT * INTO n FROM public.mimo_agente_alertas WHERE id=(_p->>'id')::uuid;
  SELECT * INTO c FROM public.mimo_agente_observacao_config WHERE empresa_id=n.empresa_id FOR SHARE;
  IF n.tipo='lead' THEN PERFORM 1 FROM public.mimo_agente_analises WHERE empresa_id=n.empresa_id AND lead_id=n.lead_id FOR SHARE; END IF;
  SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id AND empresa_id=c.empresa_id AND ativo FOR SHARE;
  PERFORM 1 FROM public.empresa_membros WHERE empresa_id=c.empresa_id ORDER BY user_id FOR SHARE;
  SELECT * INTO n FROM public.mimo_agente_alertas WHERE id=(_p->>'id')::uuid FOR UPDATE;
  IF n.id IS NULL OR n.estado<>'reservada' OR n.reserva IS DISTINCT FROM (_p->>'reserva')::uuid OR n.reservada_em<clock_timestamp()-interval '3 minutes' THEN RETURN 'false'::jsonb; END IF;
  IF c.versao<>n.config_versao OR c.destino<>n.destino OR c.vinculo_id<>n.vinculo_id OR v.id IS NULL OR c.destino=public.mimo_normalizar_telefone(v.numero_comercial)
   OR NOT public.tem_papel_empresa(c.empresa_id,c.atualizado_por,ARRAY['administrador','gestor']::public.empresa_papel[]) OR NOT public.tem_papel_empresa(c.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[])
   OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=c.empresa_id AND slug='mimo' AND ativa)
   OR (n.tipo='lead' AND (NOT c.ativo OR CASE WHEN n.encaminhamento_fila_id IS NOT NULL THEN NOT EXISTS(
    SELECT 1 FROM public.mimo_agente_fila f JOIN public.mimo_agente_conversas cv ON cv.id=f.conversa_id AND cv.empresa_id=f.empresa_id
    WHERE f.id=n.encaminhamento_fila_id AND f.empresa_id=n.empresa_id AND cv.lead_id=n.lead_id AND NOT cv.piloto AND cv.estado<>'bloqueada'
     AND f.estado='enviada' AND f.message_id IS NOT NULL AND f.solicitado_por IS NULL AND f.resultado->>'estado'='humano')
    ELSE NOT EXISTS(SELECT 1 FROM public.mimo_agente_sinais s JOIN public.mimo_agente_analises x ON x.empresa_id=s.empresa_id AND x.lead_id=s.lead_id WHERE s.empresa_id=n.empresa_id AND s.lead_id=n.lead_id AND s.quente AND s.sequencia=n.sequencia AND x.sequencia=n.sequencia AND x.estado='concluida') END))
  THEN UPDATE public.mimo_agente_alertas SET estado='cancelada' WHERE id=n.id; RETURN 'false'::jsonb; END IF;
  UPDATE public.mimo_agente_alertas SET estado='enviando',reservada_em=clock_timestamp() WHERE id=n.id; RETURN 'true'::jsonb;
 ELSIF _acao='finalizar_alerta' THEN
  UPDATE public.mimo_agente_alertas SET estado=CASE WHEN coalesce(length(_p->>'message_id'),0) BETWEEN 1 AND 200 THEN 'aceita' ELSE 'incerta' END,message_id=nullif(_p->>'message_id','')
  WHERE id=(_p->>'id')::uuid AND reserva=(_p->>'reserva')::uuid AND estado IN ('enviando','incerta');RETURN to_jsonb(FOUND);
 END IF;
 RAISE EXCEPTION 'Ação inválida';
END $function$
;
