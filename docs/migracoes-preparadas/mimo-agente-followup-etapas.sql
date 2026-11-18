-- Apply only after verified backup. Existing reminders retain their dedupe and do not
-- acquire a retroactive second step. Both deadlines use the last customer message.
ALTER TABLE public.mimo_agente_followup_envios
 ADD COLUMN etapa smallint NOT NULL DEFAULT 1 CHECK(etapa IN (1,2)),
 ADD COLUMN entrada_id uuid REFERENCES public.mimo_whatsapp_eventos(id),
 ADD COLUMN silencio_em timestamptz,
 ADD COLUMN duas_etapas boolean NOT NULL DEFAULT false;
ALTER TABLE public.mimo_agente_followup_envios ALTER COLUMN duas_etapas SET DEFAULT true;
ALTER TABLE public.mimo_agente_followup_envios DROP CONSTRAINT mimo_agente_followup_envios_pkey;
ALTER TABLE public.mimo_agente_followup_envios ADD PRIMARY KEY(conversa_id,etapa);

CREATE OR REPLACE FUNCTION public.mimo_agente_followup_agendar() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_agente_config; c public.mimo_agente_conversas;
 f public.mimo_agente_fila; primeiro public.mimo_agente_followup_envios;
 entrada public.mimo_whatsapp_eventos; novo uuid; passo integer; total integer:=0;
BEGIN
 SELECT a.* INTO cfg FROM public.mimo_agente_config a JOIN public.mimo_agente_followup_config fc USING(empresa_id)
 WHERE a.modo='ativo' AND fc.ativo ORDER BY a.empresa_id LIMIT 1 FOR UPDATE OF a SKIP LOCKED;
 IF cfg.empresa_id IS NULL THEN RETURN 0; END IF;
 PERFORM 1 FROM public.mimo_agente_followup_config WHERE empresa_id=cfg.empresa_id AND ativo FOR SHARE;
 IF NOT FOUND THEN RETURN 0; END IF;
 FOR c IN SELECT x.* FROM public.mimo_agente_conversas x
 WHERE x.empresa_id=cfg.empresa_id AND x.estado='agente' AND NOT x.piloto AND NOT x.followup_bloqueado
 AND x.vinculo_id=cfg.vinculo_id
 AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_followup_envios s WHERE s.conversa_id=x.id AND (s.etapa=2 OR NOT s.duas_etapas))
 AND EXISTS(SELECT 1 FROM public.mimo_agente_fila q WHERE q.conversa_id=x.id AND q.sequencia=x.sequencia
   AND q.estado='enviada' AND q.solicitado_por IS NULL AND q.versao=cfg.publicada AND q.resultado->>'estado'='agente')
 AND EXISTS(SELECT 1 FROM (SELECT ev.id,ev.created_at FROM public.mimo_whatsapp_eventos ev
   WHERE ev.empresa_id=x.empresa_id AND ev.lead_id=x.lead_id AND ev.vinculo_id=x.vinculo_id AND ev.direcao='recebida'
   ORDER BY ev.created_at DESC,ev.id DESC LIMIT 1) ultima
   LEFT JOIN public.mimo_agente_followup_envios s ON s.conversa_id=x.id AND s.etapa=1
   WHERE ultima.created_at>=greatest((SELECT inicio_em FROM public.mimo_agente_followup_config WHERE empresa_id=cfg.empresa_id),clock_timestamp()-interval '24 hours')
   AND ultima.created_at<=clock_timestamp()-(CASE WHEN s.conversa_id IS NULL THEN interval '40 minutes' ELSE interval '3 hours' END)
   AND (s.conversa_id IS NULL OR s.entrada_id=ultima.id))
 ORDER BY x.created_at LIMIT 200 FOR UPDATE OF x SKIP LOCKED LOOP
  SELECT * INTO primeiro FROM public.mimo_agente_followup_envios WHERE conversa_id=c.id AND etapa=1;
  passo:=CASE WHEN primeiro.conversa_id IS NULL THEN 1 ELSE 2 END;
  SELECT * INTO entrada FROM public.mimo_whatsapp_eventos
   WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND vinculo_id=c.vinculo_id AND direcao='recebida'
   ORDER BY created_at DESC,id DESC LIMIT 1;
  IF entrada.id IS NULL OR entrada.created_at<clock_timestamp()-interval '24 hours'
   OR entrada.created_at<(SELECT inicio_em FROM public.mimo_agente_followup_config WHERE empresa_id=cfg.empresa_id)
   OR entrada.created_at>clock_timestamp()-(CASE passo WHEN 1 THEN interval '40 minutes' ELSE interval '3 hours' END)
   OR (passo=2 AND entrada.id IS DISTINCT FROM primeiro.entrada_id) THEN CONTINUE; END IF;
  SELECT * INTO f FROM public.mimo_agente_fila WHERE conversa_id=c.id AND sequencia=c.sequencia AND estado='enviada'
   AND solicitado_por IS NULL AND versao=cfg.publicada AND resultado->>'estado'='agente' AND message_id IS NOT NULL;
  IF f.id IS NULL OR (passo=2 AND f.id<>primeiro.fila_id) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.mimo_agente_alertas WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND tipo='lead' AND estado IN ('pendente','reservada','enviando','aceita','incerta')) THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mimo_leads WHERE empresa_id=c.empresa_id AND id=c.lead_id AND etapa IN ('novo','contato_realizado') AND qualificacao='pendente') THEN CONTINUE; END IF;
  IF (SELECT message_id FROM public.mimo_whatsapp_eventos WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id ORDER BY created_at DESC,id DESC LIMIT 1) IS DISTINCT FROM f.message_id THEN CONTINUE; END IF;
  UPDATE public.mimo_agente_conversas SET sequencia=sequencia+1 WHERE id=c.id;
  -- Keep the legacy queue discriminator so an older deployed worker remains safe.
  INSERT INTO public.mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,executar_em,motivo)
   VALUES(c.empresa_id,c.id,c.sequencia+1,cfg.publicada,clock_timestamp(),'followup_2h') RETURNING id INTO novo;
  INSERT INTO public.mimo_agente_followup_envios(conversa_id,empresa_id,fila_id,origem_id,etapa,entrada_id,silencio_em)
   VALUES(c.id,c.empresa_id,novo,f.id,passo,entrada.id,entrada.created_at);
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados)
   VALUES(c.empresa_id,c.id,'followup_agendado',jsonb_build_object('fila',novo,'origem',f.id,'etapa',passo,'silencio_em',entrada.created_at));
  total:=total+1;
  EXIT WHEN total>=10;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_followup_agendar() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_followup_agendar() TO service_role;

-- Amend the current worker in place, retaining all intervening handoff/transport fixes.
DO $patch$
DECLARE anterior text; atual text;
BEGIN
 SELECT pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure) INTO anterior;
 atual:=replace(anterior,
  '''followup'',f.motivo=''followup_2h'',',
  '''followupEtapa'',(SELECT etapa FROM public.mimo_agente_followup_envios WHERE fila_id=f.id),''followup'',f.motivo=''followup_2h'',');
 IF atual=anterior THEN RAISE EXCEPTION 'Worker incompatível: marcador followup ausente'; END IF;
 EXECUTE atual;
END $patch$;
