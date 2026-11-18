-- Service-only transcription of messages in a currently reserved conversation.
-- Inbound receipt already invalidated older tasks before any external transcription.
CREATE FUNCTION public.mimo_agente_audio(_p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.mimo_agente_fila; c public.mimo_agente_conversas; e public.mimo_whatsapp_eventos; transcrito text; audios jsonb;
BEGIN
 IF public.mimo_agente_worker('validar',_p) IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
 SELECT * INTO f FROM public.mimo_agente_fila WHERE id=(_p->>'id')::uuid AND reserva=(_p->>'reserva')::uuid;
 SELECT * INTO c FROM public.mimo_agente_conversas WHERE id=f.conversa_id AND empresa_id=f.empresa_id;
 IF c.id IS NULL OR c.piloto THEN RETURN NULL; END IF;
 IF _p->>'evento' IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'messageId',x.message_id) ORDER BY x.created_at,x.id),'[]') INTO audios
  FROM (SELECT a.* FROM public.mimo_whatsapp_eventos a WHERE a.empresa_id=c.empresa_id AND a.lead_id=c.lead_id AND a.vinculo_id=c.vinculo_id
   AND a.direcao='recebida' AND a.texto='[audio]' AND a.created_at>=clock_timestamp()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_eventos b WHERE b.empresa_id=c.empresa_id AND b.lead_id=c.lead_id AND b.direcao='enviada' AND (b.created_at,b.id)>(a.created_at,a.id))
   ORDER BY a.created_at,a.id LIMIT 3) x;
  RETURN audios;
 END IF;
 transcrito:=btrim(_p->>'texto');
 IF transcrito IS NULL OR length(transcrito) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Transcrição inválida'; END IF;
 SELECT * INTO e FROM public.mimo_whatsapp_eventos WHERE id=(_p->>'evento')::uuid AND empresa_id=c.empresa_id
  AND lead_id=c.lead_id AND vinculo_id=c.vinculo_id AND direcao='recebida' AND texto='[audio]'
  AND created_at>=clock_timestamp()-interval '24 hours' FOR UPDATE;
 IF e.id IS NULL OR EXISTS(SELECT 1 FROM public.mimo_whatsapp_eventos b WHERE b.empresa_id=c.empresa_id AND b.lead_id=c.lead_id AND b.direcao='enviada' AND (b.created_at,b.id)>(e.created_at,e.id)) THEN RETURN NULL; END IF;
 UPDATE public.mimo_whatsapp_eventos SET texto='[Transcrição de áudio]'||chr(10)||transcrito WHERE id=e.id;
 INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados)
  VALUES(c.empresa_id,c.id,'audio_transcrito',jsonb_build_object('evento',e.id,'fila',f.id));
 RETURN jsonb_build_object('texto','[Transcrição de áudio]'||chr(10)||transcrito);
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_audio(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_audio(jsonb) TO service_role;

DO $patch$
DECLARE anterior text; atual text;
BEGIN
 SELECT pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure) INTO anterior;
 atual:=replace(anterior,'''resumo'',c.resumo,',
  '''catalogoApresentado'',EXISTS(SELECT 1 FROM public.mimo_agente_fila cf JOIN public.mimo_agente_materiais cm ON cm.id::text=cf.resultado->>''materialId'' AND cm.empresa_id=cf.empresa_id AND cm.tipo=''catalogo'' WHERE cf.conversa_id=c.id AND cf.estado=''enviada''),''resumo'',c.resumo,');
 atual:=replace(atual,'''content'',texto)', '''content'',texto,''messageId'',message_id)');
 atual:=replace(atual,'SELECT id,direcao,texto,created_at FROM','SELECT id,direcao,texto,created_at,message_id FROM');
 IF atual=anterior OR position('''messageId'',message_id' in atual)=0 OR position('''catalogoApresentado''' in atual)=0 THEN RAISE EXCEPTION 'Worker incompatível com áudio/catálogo'; END IF;
 EXECUTE atual;
END $patch$;
