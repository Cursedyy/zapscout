-- Prepared schema. No destination, activation, transcript, credential or message is embedded.
CREATE TABLE public.mimo_agente_observacao_config(
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id),
 destino text NOT NULL CHECK(destino ~ '^[1-9][0-9]{11,14}$'),ativo boolean NOT NULL DEFAULT false,
 inicio_em timestamptz NOT NULL DEFAULT clock_timestamp(),versao integer NOT NULL DEFAULT 1,
 atualizado_por uuid NOT NULL,atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.mimo_agente_aprendizado(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 perfil jsonb NOT NULL,estatisticas jsonb NOT NULL,origem_eventos uuid[] NOT NULL DEFAULT '{}',
 config_revisao integer,ator_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.mimo_agente_analises(
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
 evento_id uuid NOT NULL REFERENCES public.mimo_whatsapp_eventos(id),sequencia integer NOT NULL DEFAULT 1,
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','reservada','concluida')),
 executar_em timestamptz NOT NULL,reserva uuid,reservada_em timestamptz,PRIMARY KEY(empresa_id,lead_id)
);
CREATE TABLE public.mimo_agente_sinais(
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
 evento_id uuid NOT NULL,sequencia integer NOT NULL,quente boolean NOT NULL,motivos jsonb NOT NULL,
 evidencias jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(empresa_id,lead_id)
);
CREATE TABLE public.mimo_agente_alertas(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 lead_id uuid REFERENCES public.mimo_leads(id),tipo text NOT NULL CHECK(tipo IN ('lead','teste')),
 config_versao integer NOT NULL,sequencia integer NOT NULL DEFAULT 0,destino text NOT NULL,vinculo_id uuid NOT NULL,
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','reservada','enviando','aceita','incerta','cancelada')),
 reserva uuid,reservada_em timestamptz,message_id text,erro text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((tipo='teste' AND lead_id IS NULL) OR (tipo='lead' AND lead_id IS NOT NULL))
);
CREATE UNIQUE INDEX mimo_alerta_teste_unico ON public.mimo_agente_alertas(empresa_id,config_versao) WHERE tipo='teste';
CREATE UNIQUE INDEX mimo_alerta_evento_unico ON public.mimo_agente_alertas(empresa_id,lead_id,sequencia) WHERE tipo='lead';
CREATE INDEX mimo_analise_pendente ON public.mimo_agente_analises(executar_em) WHERE estado IN ('pendente','reservada');
CREATE INDEX mimo_alertas_pendentes ON public.mimo_agente_alertas(created_at) WHERE estado IN ('pendente','reservada','enviando');
DO $observacao_grants$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mimo_agente_observacao_config','mimo_agente_aprendizado','mimo_agente_analises','mimo_agente_sinais','mimo_agente_alertas'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY observacao_gestao ON public.%I FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY[''administrador'',''gestor'']::public.empresa_papel[]))',t);
 END LOOP;
END $observacao_grants$;
CREATE TRIGGER mimo_aprendizado_imutavel BEFORE UPDATE OR DELETE ON public.mimo_agente_aprendizado FOR EACH ROW EXECUTE FUNCTION public.mimo_follow_history_imutavel();

CREATE OR REPLACE FUNCTION public.mimo_comercial_telefone_interno(_empresa uuid,_numero text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos v WHERE v.empresa_id=_empresa AND v.ativo AND public.mimo_normalizar_telefone(v.numero_comercial)=_numero)
 OR EXISTS(SELECT 1 FROM public.mimo_follow_aviso_config c JOIN public.empresa_membros m ON m.empresa_id=c.empresa_id AND m.user_id=c.membro_id AND m.ativo WHERE c.empresa_id=_empresa AND c.numero=_numero)
 OR EXISTS(SELECT 1 FROM public.mimo_agente_observacao_config c WHERE c.empresa_id=_empresa AND c.destino=_numero)
$$;
REVOKE ALL ON FUNCTION public.mimo_comercial_telefone_interno(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.mimo_observar_entrada() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 UPDATE public.mimo_agente_alertas SET estado='cancelada' WHERE empresa_id=NEW.empresa_id AND lead_id=NEW.lead_id AND estado IN ('pendente','reservada');
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_observar_entrada AFTER UPDATE OF lead_id ON public.mimo_whatsapp_eventos FOR EACH ROW EXECUTE FUNCTION public.mimo_observar_entrada();

CREATE FUNCTION public.mimo_quentes_operar(_acao text,_p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  RETURN to_jsonb(n)||jsonb_build_object('nome',l.nome_empresa,'telefone',l.telefone_normalizado,'sinal',to_jsonb(sinal));
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
   OR (n.tipo='lead' AND (NOT c.ativo OR NOT EXISTS(SELECT 1 FROM public.mimo_agente_sinais s JOIN public.mimo_agente_analises x ON x.empresa_id=s.empresa_id AND x.lead_id=s.lead_id WHERE s.empresa_id=n.empresa_id AND s.lead_id=n.lead_id AND s.quente AND s.sequencia=n.sequencia AND x.sequencia=n.sequencia AND x.estado='concluida')))
  THEN UPDATE public.mimo_agente_alertas SET estado='cancelada' WHERE id=n.id; RETURN 'false'::jsonb; END IF;
  UPDATE public.mimo_agente_alertas SET estado='enviando',reservada_em=clock_timestamp() WHERE id=n.id; RETURN 'true'::jsonb;
 ELSIF _acao='finalizar_alerta' THEN
  UPDATE public.mimo_agente_alertas SET estado=CASE WHEN coalesce(length(_p->>'message_id'),0) BETWEEN 1 AND 200 THEN 'aceita' ELSE 'incerta' END,message_id=nullif(_p->>'message_id','')
  WHERE id=(_p->>'id')::uuid AND reserva=(_p->>'reserva')::uuid AND estado IN ('enviando','incerta');RETURN to_jsonb(FOUND);
 END IF;
 RAISE EXCEPTION 'Ação inválida';
END $$;
REVOKE ALL ON FUNCTION public.mimo_quentes_operar(text,jsonb),public.mimo_observar_entrada() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_quentes_operar(text,jsonb) TO service_role;
