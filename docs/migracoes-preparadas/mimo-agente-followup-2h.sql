-- Additive preparation: backup validated before applying; enable only after code deployment.
ALTER TABLE public.mimo_agente_conversas ADD COLUMN followup_bloqueado boolean NOT NULL DEFAULT false;
UPDATE public.mimo_agente_conversas c SET followup_bloqueado=true
WHERE c.estado<>'agente'
 OR EXISTS(SELECT 1 FROM public.mimo_agente_fila f WHERE f.conversa_id=c.id AND (f.resultado->>'estado' IN ('humano','bloqueada') OR f.solicitado_por IS NOT NULL OR f.estado IN ('incerta','falha')))
 OR EXISTS(SELECT 1 FROM public.mimo_agente_historico h WHERE h.conversa_id=c.id AND h.acao IN ('assumir','pausar','resposta_manual','devolver'));
CREATE FUNCTION public.mimo_agente_followup_bloquear() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.followup_bloqueado := NEW.followup_bloqueado OR OLD.followup_bloqueado OR NEW.estado<>'agente';
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_agente_followup_bloquear BEFORE UPDATE ON public.mimo_agente_conversas FOR EACH ROW EXECUTE FUNCTION public.mimo_agente_followup_bloquear();
CREATE TABLE public.mimo_agente_followup_config (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
 ativo boolean NOT NULL DEFAULT false,
 inicio_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.mimo_agente_followup_envios (
 conversa_id uuid PRIMARY KEY REFERENCES public.mimo_agente_conversas(id),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 fila_id uuid NOT NULL UNIQUE REFERENCES public.mimo_agente_fila(id),
 origem_id uuid NOT NULL REFERENCES public.mimo_agente_fila(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.mimo_agente_followup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_agente_followup_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_agente_followup_config,public.mimo_agente_followup_envios FROM anon,authenticated;
GRANT ALL ON public.mimo_agente_followup_config,public.mimo_agente_followup_envios TO service_role;

CREATE FUNCTION public.mimo_agente_followup_agendar() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.mimo_agente_config; c public.mimo_agente_conversas; f public.mimo_agente_fila; novo uuid; total integer:=0;
BEGIN
 SELECT a.* INTO cfg FROM public.mimo_agente_config a JOIN public.mimo_agente_followup_config fc USING(empresa_id)
 WHERE a.modo='ativo' AND fc.ativo ORDER BY a.empresa_id LIMIT 1 FOR UPDATE OF a SKIP LOCKED;
 IF cfg.empresa_id IS NULL THEN RETURN 0; END IF;
 PERFORM 1 FROM public.mimo_agente_followup_config WHERE empresa_id=cfg.empresa_id AND ativo FOR SHARE;
 IF NOT FOUND THEN RETURN 0; END IF;
 FOR c IN SELECT x.* FROM public.mimo_agente_conversas x
 WHERE x.empresa_id=cfg.empresa_id AND x.estado='agente' AND NOT x.piloto AND NOT x.followup_bloqueado
 AND x.vinculo_id=cfg.vinculo_id
 AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_followup_envios s WHERE s.conversa_id=x.id)
 AND EXISTS(SELECT 1 FROM public.mimo_agente_fila z JOIN public.mimo_agente_followup_config fc ON fc.empresa_id=z.empresa_id WHERE z.conversa_id=x.id AND z.sequencia=x.sequencia AND z.estado='enviada' AND z.solicitado_por IS NULL AND z.versao=cfg.publicada AND z.resultado->>'estado'='agente' AND z.updated_at BETWEEN greatest(fc.inicio_em,clock_timestamp()-interval '24 hours') AND clock_timestamp()-interval '2 hours')
 ORDER BY x.created_at LIMIT 200 FOR UPDATE OF x SKIP LOCKED LOOP
  SELECT * INTO f FROM public.mimo_agente_fila WHERE conversa_id=c.id AND sequencia=c.sequencia AND estado='enviada'
   AND solicitado_por IS NULL AND versao=cfg.publicada AND resultado->>'estado'='agente' AND message_id IS NOT NULL
   AND updated_at<=clock_timestamp()-interval '2 hours'
   AND updated_at>=clock_timestamp()-interval '24 hours'
   AND updated_at>=(SELECT inicio_em FROM public.mimo_agente_followup_config WHERE empresa_id=cfg.empresa_id);
  IF f.id IS NULL THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.mimo_agente_alertas WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND tipo='lead' AND estado IN ('pendente','reservada','enviando','aceita','incerta')) THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mimo_leads WHERE empresa_id=c.empresa_id AND id=c.lead_id AND etapa IN ('novo','contato_realizado') AND qualificacao='pendente') THEN CONTINUE; END IF;
  IF (SELECT message_id FROM public.mimo_whatsapp_eventos WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id ORDER BY created_at DESC,id DESC LIMIT 1) IS DISTINCT FROM f.message_id THEN CONTINUE; END IF;
  UPDATE public.mimo_agente_conversas SET sequencia=sequencia+1 WHERE id=c.id;
  INSERT INTO public.mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,executar_em,motivo)
   VALUES(c.empresa_id,c.id,c.sequencia+1,cfg.publicada,clock_timestamp(),'followup_2h') RETURNING id INTO novo;
  INSERT INTO public.mimo_agente_followup_envios(conversa_id,empresa_id,fila_id,origem_id) VALUES(c.id,c.empresa_id,novo,f.id);
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados) VALUES(c.empresa_id,c.id,'followup_2h_agendado',jsonb_build_object('fila',novo,'origem',f.id));
  total:=total+1;
  EXIT WHEN total>=10;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_followup_agendar() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_followup_agendar() TO service_role;
REVOKE ALL ON FUNCTION public.mimo_agente_followup_bloquear() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mimo_agente_worker(_acao text, _p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.mimo_agente_fila; c public.mimo_agente_conversas; cfg public.mimo_agente_config; v jsonb; msgs jsonb; permitido boolean; e uuid;
BEGIN
 IF _acao='reservar' THEN
  -- Lock config first in every path: serializes pause, ingestion and final send authorization.
  SELECT * INTO cfg FROM public.mimo_agente_config WHERE EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE empresa_id=mimo_agente_config.empresa_id AND ((estado IN ('reservada','enviando') AND reservada_em<clock_timestamp()-interval '3 minutes') OR (mimo_agente_config.modo<>'desativado' AND estado='pendente' AND solicitado_por IS NULL AND executar_em<=clock_timestamp()))) ORDER BY empresa_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF cfg.empresa_id IS NULL THEN RETURN NULL; END IF;
  -- Interrupted model runs go to a person; interrupted sends remain uncertain, never retried.
  UPDATE public.mimo_agente_conversas SET estado='humano',motivo='processamento_interrompido' WHERE estado<>'bloqueada' AND empresa_id=cfg.empresa_id AND id IN(SELECT conversa_id FROM public.mimo_agente_fila WHERE estado IN ('reservada','enviando') AND reservada_em<clock_timestamp()-interval '3 minutes');
  UPDATE public.mimo_agente_fila SET estado=CASE estado WHEN 'enviando' THEN 'incerta' ELSE 'falha' END,motivo='processamento_interrompido' WHERE empresa_id=cfg.empresa_id AND estado IN ('reservada','enviando') AND reservada_em<clock_timestamp()-interval '3 minutes';
  IF cfg.modo='desativado' THEN RETURN NULL; END IF;
  SELECT * INTO f FROM public.mimo_agente_fila WHERE empresa_id=cfg.empresa_id AND estado='pendente' AND solicitado_por IS NULL AND executar_em<=clock_timestamp() ORDER BY executar_em LIMIT 1 FOR UPDATE SKIP LOCKED;
 ELSE
  SELECT empresa_id INTO e FROM public.mimo_agente_fila WHERE id=(_p->>'id')::uuid;
  SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id=e FOR UPDATE;
  SELECT * INTO f FROM public.mimo_agente_fila WHERE id=(_p->>'id')::uuid AND reserva=(_p->>'reserva')::uuid FOR UPDATE;
 END IF;
 IF f.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.mimo_agente_conversas WHERE id=f.conversa_id FOR UPDATE;
 SELECT config INTO v FROM public.mimo_agente_versoes WHERE empresa_id=f.empresa_id AND versao=f.versao;
 PERFORM 1 FROM public.empresas WHERE id=f.empresa_id FOR SHARE;
 PERFORM 1 FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id FOR SHARE;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=f.empresa_id AND user_id IN (
  SELECT ator_id FROM public.mimo_agente_versoes WHERE empresa_id=f.empresa_id AND versao=f.versao
  UNION SELECT confirmado_por FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id) ORDER BY user_id FOR SHARE;
 PERFORM 1 FROM public.mimo_leads WHERE id=c.lead_id AND empresa_id=c.empresa_id FOR SHARE;
 permitido:=cfg.modo<>'desativado' AND cfg.publicada=f.versao AND cfg.vinculo_id=c.vinculo_id AND c.estado='agente' AND c.sequencia=f.sequencia
  AND EXISTS(SELECT 1 FROM public.empresas WHERE id=f.empresa_id AND ativa AND slug='mimo')
  AND EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id AND empresa_id=c.empresa_id AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[]))
  AND (NOT c.piloto OR coalesce(v->'pilotos' ? c.telefone,false)) AND (cfg.modo<>'piloto' OR c.piloto)
  AND (c.piloto OR EXISTS(SELECT 1 FROM public.mimo_leads WHERE id=c.lead_id AND empresa_id=c.empresa_id AND etapa IN ('novo','contato_realizado') AND qualificacao='pendente'))
  AND EXISTS(SELECT 1 FROM public.mimo_agente_versoes av WHERE av.empresa_id=c.empresa_id AND av.versao=f.versao AND public.tem_papel_empresa(c.empresa_id,av.ator_id,ARRAY['administrador','gestor']::public.empresa_papel[]));
 IF f.motivo='followup_2h' THEN
  permitido:=permitido AND NOT c.followup_bloqueado
   AND EXISTS(SELECT 1 FROM public.mimo_agente_followup_config WHERE empresa_id=c.empresa_id AND ativo)
   AND EXISTS(SELECT 1 FROM public.mimo_agente_followup_envios WHERE conversa_id=c.id AND fila_id=f.id)
   AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_alertas WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND tipo='lead' AND estado IN ('pendente','reservada','enviando','aceita','incerta'));
 END IF;
 IF _acao='reservar' THEN
  IF NOT coalesce(permitido,false) THEN UPDATE public.mimo_agente_fila SET estado='cancelada' WHERE id=f.id; RETURN NULL; END IF;
  IF (SELECT coalesce(sum(geracoes),0) FROM public.mimo_agente_fila WHERE conversa_id=c.id)>=coalesce((v->>'maxMensagens')::int,16)
   OR (SELECT coalesce(sum(geracoes),0) FROM public.mimo_agente_fila WHERE empresa_id=c.empresa_id AND inicio_em>=date_trunc('day',clock_timestamp()))>=coalesce((v->>'limiteDiario')::int,100) THEN
   UPDATE public.mimo_agente_conversas SET estado='humano',motivo='limite_de_uso' WHERE id=c.id;
   UPDATE public.mimo_agente_fila SET estado='falha',motivo='limite_de_uso' WHERE id=f.id; RETURN NULL;
  END IF;
  UPDATE public.mimo_agente_fila SET estado='reservada',reserva=gen_random_uuid(),reservada_em=clock_timestamp(),geracoes=1 WHERE id=f.id RETURNING * INTO f;
  SELECT coalesce(jsonb_agg(jsonb_build_object('role',CASE WHEN direcao='recebida' THEN 'user' ELSE 'assistant' END,'content',texto) ORDER BY created_at,id),'[]') INTO msgs FROM (SELECT id,direcao,texto,created_at FROM (
 SELECT id,direcao,texto,created_at FROM public.mimo_whatsapp_eventos WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND NOT c.piloto
 UNION ALL SELECT id,direcao,texto,created_at FROM public.mimo_agente_piloto_eventos WHERE empresa_id=c.empresa_id AND conversa_id=c.id AND c.piloto
 ) m ORDER BY created_at DESC,id DESC LIMIT 40)t;
  RETURN jsonb_build_object('id',f.id,'reserva',f.reserva,'empresa',c.empresa_id,'conversa',c.id,'telefone',c.telefone,'vinculo',c.vinculo_id,'config',v,'dados',c.dados,'mensagens',msgs,
   'followup',f.motivo='followup_2h','materiais',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.mimo_agente_materiais m WHERE m.empresa_id=c.empresa_id AND m.ativo AND v->'materiais' ? m.id::text),'[]'));
 ELSIF _acao='validar' THEN
  RETURN to_jsonb(coalesce(permitido,false) AND f.estado='reservada' AND f.reservada_em>clock_timestamp()-interval '3 minutes');
 ELSIF _acao='autorizar' THEN
  IF NOT coalesce(permitido,false) OR f.estado<>'reservada' OR f.reservada_em<clock_timestamp()-interval '3 minutes' THEN RETURN 'false'; END IF;
  IF _p->'resultado'->>'materialId' IS NOT NULL THEN
   PERFORM 1 FROM public.mimo_agente_materiais WHERE id=(_p->'resultado'->>'materialId')::uuid AND empresa_id=c.empresa_id AND ativo AND v->'materiais' ? id::text FOR SHARE;
   IF NOT FOUND THEN RETURN 'false'; END IF;
  END IF;
  IF coalesce(length(_p->'resultado'->>'resposta'),0) NOT BETWEEN 1 AND 800 OR coalesce(_p->'resultado'->>'estado','') NOT IN ('agente','humano','bloqueada') THEN RAISE EXCEPTION 'Resposta inválida'; END IF;
  UPDATE public.mimo_agente_fila SET estado='enviando',resposta=_p->'resultado'->>'resposta',resultado=_p->'resultado',updated_at=clock_timestamp() WHERE id=f.id;
  RETURN 'true';
 ELSIF _acao IN ('enviada','incerta','falha','cancelar') THEN
  IF _acao='enviada' AND nullif(_p->>'messageId','') IS NULL THEN RAISE EXCEPTION 'Aceite sem identificação'; END IF;
  IF (_acao IN ('enviada','incerta') AND f.estado<>'enviando') OR (_acao IN ('falha','cancelar') AND f.estado<>'reservada') THEN RETURN 'false'; END IF;
  UPDATE public.mimo_agente_fila SET estado=CASE WHEN _acao='cancelar' THEN 'cancelada' ELSE _acao END,message_id=nullif(_p->>'messageId',''),motivo=coalesce(_p->>'motivo',''),latencia_ms=greatest(0,(extract(epoch FROM clock_timestamp()-f.inicio_em)*1000)::int),updated_at=clock_timestamp() WHERE id=f.id;
  IF _acao='enviada' THEN
   -- Preserve the exact issued bytes in company conversation history.
   IF c.piloto THEN
    INSERT INTO public.mimo_agente_piloto_eventos(empresa_id,conversa_id,message_id,direcao,texto,contato_em)
    VALUES(c.empresa_id,c.id,_p->>'messageId','enviada',f.resposta,clock_timestamp()) ON CONFLICT(conversa_id,message_id) DO NOTHING;
   ELSE
   INSERT INTO public.mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em)
   VALUES(c.empresa_id,c.vinculo_id,_p->>'messageId',c.lead_id,'enviada',f.resposta,clock_timestamp()) ON CONFLICT(vinculo_id,message_id) DO NOTHING;
   END IF;
   UPDATE public.mimo_agente_conversas SET dados=coalesce(f.resultado->'dados',dados),resumo=coalesce(f.resultado->>'resumo',resumo),
    estado=CASE WHEN sequencia=f.sequencia AND estado='agente' THEN coalesce(f.resultado->>'estado','humano') ELSE estado END,
    motivo=CASE WHEN sequencia=f.sequencia THEN coalesce(f.resultado->>'motivo','') ELSE motivo END,updated_at=clock_timestamp() WHERE id=c.id;
   IF EXISTS(SELECT 1 FROM public.mimo_whatsapp_eventos WHERE lead_id=c.lead_id AND empresa_id=c.empresa_id AND direcao='enviada' AND created_at>=f.reservada_em AND message_id<>_p->>'messageId') OR EXISTS(SELECT 1 FROM public.mimo_agente_piloto_eventos WHERE conversa_id=c.id AND empresa_id=c.empresa_id AND direcao='enviada' AND created_at>=f.reservada_em AND message_id<>_p->>'messageId') THEN
    UPDATE public.mimo_agente_conversas SET estado=CASE WHEN estado='bloqueada' THEN estado ELSE 'humano' END,motivo='mensagem_manual' WHERE id=c.id;
   END IF;
  ELSIF _acao IN ('incerta','falha') THEN
   UPDATE public.mimo_agente_conversas SET estado='humano',motivo=CASE _acao WHEN 'incerta' THEN 'aceite_incerto' ELSE 'falha_processamento' END WHERE id=c.id AND estado<>'bloqueada';
  END IF;
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados) VALUES(c.empresa_id,c.id,_acao,jsonb_build_object('fila',f.id));
  RETURN 'true';
 END IF;
 RAISE EXCEPTION 'Ação inválida';
END $function$

