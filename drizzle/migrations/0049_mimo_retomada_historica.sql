-- Deploy after a verified backup. Applying this file does not enqueue messages.
CREATE FUNCTION public.mimo_retomada_elegivel(_empresa uuid,_vinculo uuid,_lead uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT EXISTS (
   SELECT 1 FROM mimo_leads l
   WHERE l.empresa_id=_empresa AND l.id=_lead
     AND l.qualificacao='pendente' AND l.etapa IN ('novo','contato_realizado')
     AND EXISTS (SELECT 1 FROM mimo_whatsapp_eventos e WHERE e.empresa_id=_empresa
       AND e.vinculo_id=_vinculo AND e.lead_id=_lead AND e.direcao='recebida')
     AND NOT EXISTS (SELECT 1 FROM mimo_agente_conversas c WHERE c.empresa_id=_empresa AND c.lead_id=_lead
       AND (c.estado<>'agente' OR c.piloto OR c.followup_bloqueado OR c.vinculo_id<>_vinculo))
     AND NOT EXISTS (SELECT 1 FROM mimo_agente_alertas a WHERE a.empresa_id=_empresa AND a.lead_id=_lead
       AND a.tipo='lead' AND (a.encaminhamento_fila_id IS NOT NULL OR a.estado IN ('pendente','reservada','enviando','aceita','incerta')))
     AND NOT EXISTS (SELECT 1 FROM mimo_whatsapp_eventos e WHERE e.empresa_id=_empresa
       AND e.vinculo_id=_vinculo AND e.lead_id=_lead AND e.direcao='recebida'
       AND e.texto ~* '(descadastr|não quero mais|nao quero mais|não me envie|nao me envie|sem interesse|não tenho interesse|nao tenho interesse|^[[:space:]]*(pare|stop|desisto)[.![:space:]]*$)')
 );
$$;
REVOKE ALL ON FUNCTION public.mimo_retomada_elegivel(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

DO $patch$
DECLARE original text; alterada text;
BEGIN
 SELECT pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure) INTO original;
 IF position('IF f.motivo=''followup_2h'' THEN' in original)=0
    OR position('''followup'',f.motivo=''followup_2h''' in original)=0 THEN
   RAISE EXCEPTION 'Worker incompatível com a fila de retomada';
 END IF;
 alterada := replace(original,'IF f.motivo=''followup_2h'' THEN',
 $guard$IF f.motivo='retomada_historica' THEN
   permitido:=permitido AND public.mimo_retomada_elegivel(c.empresa_id,c.vinculo_id,c.lead_id)
    AND NOT EXISTS (SELECT 1 FROM public.mimo_whatsapp_eventos e WHERE e.empresa_id=c.empresa_id
      AND e.vinculo_id=c.vinculo_id AND e.lead_id=c.lead_id AND e.created_at>=f.inicio_em);
 END IF;
 IF f.motivo='followup_2h' THEN$guard$);
 alterada := replace(alterada,'''followup'',f.motivo=''followup_2h''',
   '''followup'',f.motivo IN (''followup_2h'',''retomada_historica'')');
 EXECUTE alterada;
END
$patch$;

CREATE FUNCTION public.mimo_retomada_agendar(_empresa uuid,_vinculo uuid,_ate timestamptz,_limite int DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg mimo_agente_config; lead record; cid uuid; seq bigint; fid uuid; total integer:=0;
 capacidade integer; config_publicada jsonb;
BEGIN
 IF _limite IS NULL OR _limite NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Limite inválido'; END IF;
 SELECT a.* INTO cfg FROM mimo_agente_config a JOIN mimo_whatsapp_vinculos v
   ON v.id=a.vinculo_id AND v.empresa_id=a.empresa_id AND v.ativo
   WHERE a.empresa_id=_empresa AND a.vinculo_id=_vinculo AND a.modo='ativo' AND a.publicada IS NOT NULL
   FOR UPDATE OF a;
 IF cfg.empresa_id IS NULL THEN RETURN 0; END IF;
 SELECT config INTO config_publicada FROM mimo_agente_versoes
 WHERE empresa_id=_empresa AND versao=cfg.publicada;
 IF EXISTS(SELECT 1 FROM mimo_agente_fila WHERE empresa_id=_empresa
   AND motivo='retomada_historica' AND estado IN ('pendente','reservada','enviando')) THEN RETURN 0; END IF;
 SELECT greatest(0,least(_limite,coalesce((config_publicada->>'limiteDiario')::int,100)
   - coalesce(sum(geracoes),0)::int - 10)) INTO capacidade
 FROM mimo_agente_fila WHERE empresa_id=_empresa AND inicio_em>=date_trunc('day',now());
 FOR lead IN
   SELECT l.id,l.telefone_normalizado FROM mimo_leads l
   WHERE l.empresa_id=_empresa AND public.mimo_retomada_elegivel(_empresa,cfg.vinculo_id,l.id)
     AND EXISTS (SELECT 1 FROM mimo_whatsapp_eventos e WHERE e.empresa_id=_empresa
       AND e.vinculo_id=cfg.vinculo_id AND e.lead_id=l.id AND e.direcao='recebida' AND e.created_at<=_ate)
     AND NOT EXISTS (SELECT 1 FROM mimo_whatsapp_eventos e WHERE e.empresa_id=_empresa
       AND e.vinculo_id=cfg.vinculo_id AND e.lead_id=l.id AND e.created_at>now()-interval '40 minutes')
     AND NOT EXISTS (SELECT 1 FROM mimo_agente_conversas c JOIN mimo_agente_historico h ON h.conversa_id=c.id
       WHERE c.empresa_id=_empresa AND c.lead_id=l.id AND h.empresa_id=_empresa AND h.dados->>'retomada_solicitada'='true')
     AND NOT EXISTS (SELECT 1 FROM mimo_agente_conversas c JOIN mimo_agente_fila f ON f.conversa_id=c.id
       WHERE c.empresa_id=_empresa AND c.lead_id=l.id AND f.estado IN ('pendente','reservada','enviando','incerta'))
     AND (SELECT coalesce(sum(f.geracoes),0) FROM mimo_agente_conversas c JOIN mimo_agente_fila f ON f.conversa_id=c.id
       WHERE c.empresa_id=_empresa AND c.lead_id=l.id) < coalesce((config_publicada->>'maxMensagens')::int,16)
   ORDER BY l.id LIMIT capacidade FOR UPDATE OF l SKIP LOCKED
 LOOP
   INSERT INTO mimo_agente_conversas(empresa_id,lead_id,vinculo_id,telefone,piloto)
   VALUES(_empresa,lead.id,cfg.vinculo_id,lead.telefone_normalizado,false) ON CONFLICT DO NOTHING;
   UPDATE mimo_agente_conversas SET sequencia=sequencia+1
   WHERE empresa_id=_empresa AND lead_id=lead.id AND vinculo_id=cfg.vinculo_id AND estado='agente'
     AND NOT piloto AND NOT followup_bloqueado RETURNING id,sequencia INTO cid,seq;
   IF NOT FOUND THEN CONTINUE; END IF;
   INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,executar_em,motivo)
   VALUES(_empresa,cid,seq,cfg.publicada,clock_timestamp()+total*interval '2 minutes','retomada_historica')
   RETURNING id INTO fid;
   INSERT INTO mimo_agente_historico(empresa_id,conversa_id,acao,dados)
   VALUES(_empresa,cid,'retomada_agendada',jsonb_build_object('fila',fid,'retomada_solicitada',true));
   total:=total+1;
 END LOOP;
 RETURN total;
END
$$;
REVOKE ALL ON FUNCTION public.mimo_retomada_agendar(uuid,uuid,timestamptz,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_retomada_agendar(uuid,uuid,timestamptz,int) TO service_role;
