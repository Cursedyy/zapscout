-- Additive, service-only setup for the explicitly requested internal group.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
ALTER TABLE public.mimo_agente_observacao_config
 ADD COLUMN grupo_nome text,
 ADD COLUMN grupo_jid text,
 ADD COLUMN grupo_status text CHECK(grupo_status IN ('pendente','teste','ativo','bloqueado')),
 ADD COLUMN grupo_erro text;
DO $$DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='public.mimo_agente_observacao_config'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%destino%' LOOP
  EXECUTE format('ALTER TABLE public.mimo_agente_observacao_config DROP CONSTRAINT %I',r.conname);
 END LOOP;
END $$;
ALTER TABLE public.mimo_agente_observacao_config ADD CONSTRAINT mimo_quentes_destino_confirmado CHECK(
 destino ~ '^[1-9][0-9]{11,14}$' OR
 coalesce((grupo_nome='leads quentes' AND grupo_jid IS NOT NULL AND destino=grupo_jid AND grupo_jid ~ '^[0-9]{5,25}(-[0-9]{5,20})?@g[.]us$'),false)
);
CREATE FUNCTION public.mimo_quentes_grupo(_acao text,_p jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.mimo_agente_observacao_config; v public.mimo_whatsapp_vinculos; ator uuid;
BEGIN
 IF _acao='consultar' THEN
  SELECT * INTO c FROM public.mimo_agente_observacao_config
  WHERE grupo_nome='leads quentes' AND (grupo_status='pendente' OR (grupo_status='teste' AND destino=grupo_jid)) ORDER BY empresa_id LIMIT 1;
  IF c.empresa_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('empresa',c.empresa_id,'vinculo',c.vinculo_id,'versao',c.versao,'status',c.grupo_status,'jid',c.grupo_jid,'atualizar',c.grupo_erro IS NULL);
 END IF;
 SELECT * INTO c FROM public.mimo_agente_observacao_config WHERE empresa_id=(_p->>'empresa')::uuid FOR UPDATE;
 IF c.empresa_id IS NULL THEN RAISE EXCEPTION 'Configure a observação primeiro'; END IF;
 ator:=CASE WHEN _acao='solicitar' THEN (_p->>'ator')::uuid ELSE c.atualizado_por END;
 PERFORM 1 FROM public.empresas WHERE id=c.empresa_id AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND OR NOT public.tem_papel_empresa(c.empresa_id,ator,ARRAY['administrador','gestor']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id AND empresa_id=c.empresa_id AND ativo FOR SHARE;
 IF v.id IS NULL OR NOT public.tem_papel_empresa(c.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Remetente inválido'; END IF;
 IF c.versao IS DISTINCT FROM (_p->>'versao')::int THEN RAISE EXCEPTION 'Versão alterada' USING ERRCODE='40001'; END IF;
 IF _acao IN ('confirmar','ativar') AND EXISTS(SELECT 1 FROM public.mimo_agente_historico WHERE empresa_id=c.empresa_id AND acao='observacao_pausar' AND created_at>c.atualizado_em) THEN RETURN 'false'; END IF;
 IF _acao='solicitar' THEN
  IF NOT EXISTS(SELECT 1 FROM public.mimo_agente_config WHERE empresa_id=c.empresa_id AND vinculo_id=c.vinculo_id AND modo='ativo') THEN RAISE EXCEPTION 'Use a conexão do atendimento'; END IF;
  PERFORM public.mimo_quentes_operar('pausar',jsonb_build_object('empresa',c.empresa_id,'ator',ator,'versao',c.versao));
  UPDATE public.mimo_agente_observacao_config SET grupo_nome='leads quentes',grupo_jid=CASE WHEN destino LIKE '%@g.us' THEN grupo_jid ELSE NULL END,grupo_status='pendente',grupo_erro=NULL,ativo=false,versao=versao+1,atualizado_por=ator,atualizado_em=clock_timestamp() WHERE empresa_id=c.empresa_id;
 ELSIF _acao='confirmar' THEN
  IF c.grupo_status IS DISTINCT FROM 'pendente' OR lower(btrim(_p->>'nome')) IS DISTINCT FROM 'leads quentes 🔥' OR coalesce(_p->>'jid','') !~ '^[0-9]{5,25}(-[0-9]{5,20})?@g[.]us$' THEN RAISE EXCEPTION 'Grupo não confirmado'; END IF;
  UPDATE public.mimo_agente_observacao_config SET destino=_p->>'jid',grupo_jid=_p->>'jid',grupo_status='teste',grupo_erro=NULL,ativo=false,versao=versao+1,atualizado_em=clock_timestamp() WHERE empresa_id=c.empresa_id RETURNING * INTO c;
  PERFORM public.mimo_quentes_operar('teste',jsonb_build_object('empresa',c.empresa_id,'ator',ator,'versao',c.versao));
 ELSIF _acao='ativar' THEN
  IF c.grupo_status IS DISTINCT FROM 'teste' OR c.grupo_jid IS DISTINCT FROM c.destino THEN RETURN 'false'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mimo_agente_alertas WHERE empresa_id=c.empresa_id AND config_versao=c.versao AND tipo='teste' AND estado='aceita') THEN RETURN 'false'; END IF;
  PERFORM public.mimo_quentes_operar('ativar',jsonb_build_object('empresa',c.empresa_id,'ator',ator,'versao',c.versao));
  UPDATE public.mimo_agente_observacao_config SET grupo_status='ativo',grupo_erro=NULL WHERE empresa_id=c.empresa_id;
 ELSIF _acao='diagnostico' THEN
  UPDATE public.mimo_agente_observacao_config SET grupo_erro=CASE WHEN _p->>'erro' IN ('grupo_quentes_ambiguo','grupo_quentes_nao_encontrado','grupo_quentes_sem_permissao','grupo_quentes_identidade_divergente') THEN _p->>'erro' ELSE 'grupo_indisponivel' END WHERE empresa_id=c.empresa_id;
 ELSE RAISE EXCEPTION 'Ação inválida'; END IF;
 INSERT INTO public.mimo_agente_historico(empresa_id,ator_id,acao,dados) VALUES(c.empresa_id,CASE WHEN _acao='solicitar' THEN ator ELSE NULL END,'grupo_quentes_'||_acao,jsonb_build_object('grupo','leads quentes','versao',c.versao));
 RETURN 'true';
END $$;
REVOKE ALL ON FUNCTION public.mimo_quentes_grupo(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_quentes_grupo(text,jsonb) TO service_role;
COMMIT;
