-- Prepared only. Verify the shared backup and apply via the official migrator before publishing.
-- Based on the definitions of the three RPCs read from production on 2026-11-19.
-- CREATE OR REPLACE preserves existing owners and EXECUTE grants. No backfill or policy/table changes.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.mimo_conversa_comercial(uuid,uuid,uuid,text,jsonb)'::regprocedure)) <> '8cce48bc2fa54d3f44940de7f13625db'
    OR md5(pg_get_functiondef('public.mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean,jsonb)'::regprocedure)) <> '3af2e30e6e3e2141740976ef799f0eba'
    OR md5(pg_get_functiondef('public.mimo_receber_whatsapp_comercial(uuid,uuid,text,text,text,text,text,timestamptz,boolean)'::regprocedure)) <> 'c3160e43ea8db3b8a32e807e4d50f645'
    THEN RAISE EXCEPTION 'As funções de WhatsApp mudaram; revise a migração antes de aplicar';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.mimo_conversa_comercial(_empresa uuid, _ator uuid, _lead uuid, _acao text, _p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cfg public.mimo_agente_config;
  c public.mimo_agente_conversas;
  f public.mimo_agente_fila;
  v public.mimo_whatsapp_vinculos;
  lead_telefone text;
  linha uuid;
  papel_ator public.empresa_papel;
  texto text := btrim(_p->>'texto');
  solicitacao_id uuid := (_p->>'solicitacao')::uuid;
BEGIN
  PERFORM 1 FROM public.empresas WHERE id = _empresa AND slug = 'mimo' AND ativa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa indisponível.'; END IF;
  IF NOT public.tem_papel_empresa(_empresa, _ator, ARRAY['administrador','gestor','vendedor']::public.empresa_papel[]) THEN
    RAISE EXCEPTION 'Conversa indisponível.';
  END IF;

  -- Read-only capability probe; the actor still needs active company membership.
  IF _acao = 'linha_pessoal_disponivel' THEN
    RETURN to_jsonb(public.tem_papel_empresa(_empresa, _ator, ARRAY['vendedor']::public.empresa_papel[]));
  END IF;

  -- The existing agent worker and webhook serialize conversation changes through this row.
  INSERT INTO public.mimo_agente_config (empresa_id, atualizado_por)
    VALUES (_empresa, _ator) ON CONFLICT DO NOTHING;
  SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id = _empresa FOR UPDATE;
  SELECT papel INTO papel_ator FROM public.empresa_membros
    WHERE empresa_id = _empresa AND user_id = _ator AND ativo AND papel IN ('administrador','gestor','vendedor') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa indisponível.'; END IF;
  SELECT telefone_normalizado INTO lead_telefone FROM public.mimo_leads
    WHERE id = _lead AND empresa_id = _empresa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa indisponível.'; END IF;

  SELECT * INTO c FROM public.mimo_agente_conversas WHERE empresa_id = _empresa AND lead_id = _lead FOR UPDATE;

  IF _acao = 'reservar' THEN
    IF coalesce(length(texto), 0) NOT BETWEEN 1 AND 2000 OR solicitacao_id IS NULL THEN
      RAISE EXCEPTION 'Mensagem inválida.';
    END IF;
    SELECT * INTO f FROM public.mimo_agente_fila WHERE empresa_id = _empresa AND solicitacao = solicitacao_id;
    IF FOUND THEN
      IF f.conversa_id IS DISTINCT FROM c.id OR f.solicitado_por IS DISTINCT FROM _ator OR f.resposta IS DISTINCT FROM texto THEN
        RAISE EXCEPTION 'Solicitação inválida.';
      END IF;
      RETURN jsonb_build_object('estado', CASE f.estado
        WHEN 'reservada' THEN CASE WHEN f.reservada_em < clock_timestamp() - interval '3 minutes' THEN 'falha' ELSE 'em_andamento' END
        WHEN 'enviando' THEN 'incerta'
        WHEN 'cancelada' THEN 'cancelada'
        WHEN 'enviada' THEN 'enviada'
        WHEN 'falha' THEN 'falha'
        ELSE 'incerta' END);
    END IF;
  ELSIF _acao = 'autorizar' THEN
    SELECT * INTO f FROM public.mimo_agente_fila
      WHERE empresa_id = _empresa AND conversa_id = c.id AND id = (_p->>'id')::uuid
        AND reserva = (_p->>'reserva')::uuid AND solicitado_por = _ator FOR UPDATE;
    IF f.id IS NULL OR f.estado <> 'reservada' OR f.sequencia <> c.sequencia
      OR f.reservada_em < clock_timestamp() - interval '3 minutes' OR c.estado <> 'humano' THEN
      RETURN 'false';
    END IF;
  ELSE
    RAISE EXCEPTION 'Ação inválida.';
  END IF;

  IF lead_telefone IS NULL OR c.piloto OR (c.id IS NOT NULL AND c.telefone IS DISTINCT FROM lead_telefone)
    OR public.mimo_comercial_telefone_interno(_empresa, lead_telefone)
    OR EXISTS (SELECT 1 FROM public.mimo_agente_conversas WHERE empresa_id = _empresa AND telefone = lead_telefone AND piloto) THEN
    IF _acao = 'autorizar' THEN RETURN 'false'; END IF;
    RETURN jsonb_build_object('estado', 'destino_indisponivel');
  END IF;
  IF c.estado = 'bloqueada' OR EXISTS (
    SELECT 1 FROM public.mimo_whatsapp_eventos ev
    WHERE ev.empresa_id = _empresa AND ev.lead_id = _lead AND ev.direcao = 'recebida'
      AND lower(ev.texto) ~ '(\m(pare|parar|stop|desisto)\M|descadastr|não quero mais|nao quero mais|não me envie|nao me envie)'
  ) THEN
    IF _acao = 'autorizar' THEN RETURN 'false'; END IF;
    RETURN jsonb_build_object('estado', 'bloqueada');
  END IF;

  IF papel_ator = 'vendedor' THEN
    -- Only the actor's current primary credential may send, never the lead's previous sender.
    SELECT * INTO v FROM public.mimo_whatsapp_vinculos
      WHERE empresa_id = _empresa AND ativo AND owner_id = _ator AND confirmado_por = _ator
        AND instancia_id IS NULL AND finalidade = 'fechamento'
        AND token_sha256 = (SELECT encode(extensions.digest(p.uazapi_instance_token, 'sha256'), 'hex')
          FROM public.profiles p WHERE p.id = _ator)
      FOR SHARE;
    IF v.id IS NOT NULL THEN
      PERFORM 1 FROM public.profiles WHERE id = _ator
        AND encode(extensions.digest(uazapi_instance_token, 'sha256'), 'hex') = v.token_sha256 FOR SHARE;
      IF NOT FOUND THEN
        IF _acao = 'autorizar' THEN RETURN 'false'; END IF;
        RETURN jsonb_build_object('estado', 'linha_indisponivel');
      END IF;
    END IF;
  ELSE
    linha := c.vinculo_id;
    IF EXISTS (
      SELECT 1 FROM public.mimo_whatsapp_vinculos p WHERE p.id = linha AND p.empresa_id = _empresa
        AND p.instancia_id IS NULL AND p.finalidade = 'fechamento' AND p.owner_id = p.confirmado_por
        AND NOT public.tem_papel_empresa(_empresa, p.confirmado_por, ARRAY['administrador']::public.empresa_papel[])
    ) THEN linha := NULL; END IF;
    IF linha IS NULL THEN
      SELECT ev.vinculo_id INTO linha FROM public.mimo_whatsapp_eventos ev
        JOIN public.mimo_whatsapp_vinculos p ON p.id = ev.vinculo_id AND p.empresa_id = ev.empresa_id
        WHERE ev.empresa_id = _empresa AND ev.lead_id = _lead
          AND NOT (p.instancia_id IS NULL AND p.finalidade IS NOT DISTINCT FROM 'fechamento'
            AND p.owner_id = p.confirmado_por
            AND NOT public.tem_papel_empresa(_empresa, p.confirmado_por, ARRAY['administrador']::public.empresa_papel[]))
        ORDER BY ev.contato_em DESC, ev.id DESC LIMIT 1;
    END IF;
    IF linha IS NULL THEN
      SELECT (array_agg(id))[1] INTO linha FROM public.mimo_whatsapp_vinculos
        WHERE empresa_id = _empresa AND ativo AND finalidade = 'entrada'
          AND public.tem_papel_empresa(_empresa, confirmado_por, ARRAY['administrador']::public.empresa_papel[])
        HAVING count(*) = 1;
    END IF;
    SELECT * INTO v FROM public.mimo_whatsapp_vinculos
      WHERE id = linha AND empresa_id = _empresa AND ativo
        AND public.tem_papel_empresa(_empresa, confirmado_por, ARRAY['administrador']::public.empresa_papel[]) FOR SHARE;
  END IF;
  IF v.id IS NULL THEN
    IF _acao = 'autorizar' THEN RETURN 'false'; END IF;
    RETURN jsonb_build_object('estado', 'linha_indisponivel');
  END IF;

  IF _acao = 'autorizar' THEN
    IF v.token_sha256 IS DISTINCT FROM _p->>'tokenHash'
      OR (f.resultado->>'vinculoPessoal') IS DISTINCT FROM (CASE WHEN papel_ator = 'vendedor' THEN v.id::text END)
      THEN RETURN 'false'; END IF;
    -- The existing worker records the accepted send against the conversation's binding.
    -- Move it only after final checks, while the locked queue excludes another in-flight send.
    IF c.vinculo_id IS DISTINCT FROM v.id THEN
      UPDATE public.mimo_agente_conversas SET vinculo_id = v.id WHERE id = c.id;
    END IF;
    UPDATE public.mimo_agente_fila SET estado = 'enviando', updated_at = clock_timestamp() WHERE id = f.id;
    RETURN 'true';
  END IF;

  IF c.id IS NULL THEN
    INSERT INTO public.mimo_agente_conversas (empresa_id, lead_id, vinculo_id, telefone, piloto, estado)
      VALUES (_empresa, _lead, v.id, lead_telefone, false, 'humano') RETURNING * INTO c;
  END IF;
  IF EXISTS (SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id = c.id AND estado IN ('enviando','incerta')) THEN
    RETURN jsonb_build_object('estado', 'envio_pendente');
  END IF;
  IF EXISTS (SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id = c.id AND solicitado_por IS NOT NULL
    AND estado = 'reservada' AND reservada_em >= clock_timestamp() - interval '3 minutes') THEN
    RETURN jsonb_build_object('estado', 'em_andamento');
  END IF;

  UPDATE public.mimo_agente_fila SET estado = 'cancelada', motivo = 'resposta_manual'
    WHERE conversa_id = c.id AND estado IN ('pendente','reservada');
  UPDATE public.mimo_agente_conversas
    SET estado = 'humano', sequencia = sequencia + 1, motivo = 'resposta_manual', updated_at = clock_timestamp()
    WHERE id = c.id RETURNING * INTO c;
  INSERT INTO public.mimo_agente_fila (empresa_id, conversa_id, sequencia, versao, executar_em, estado,
    reserva, reservada_em, resposta, solicitado_por, solicitacao, resultado)
    VALUES (_empresa, c.id, c.sequencia, coalesce(cfg.publicada, 0), clock_timestamp(), 'reservada',
      gen_random_uuid(), clock_timestamp(), texto, _ator, solicitacao_id,
      CASE WHEN papel_ator = 'vendedor' THEN jsonb_build_object('vinculoPessoal',v.id) END) RETURNING * INTO f;
  INSERT INTO public.mimo_agente_historico (empresa_id, conversa_id, ator_id, acao)
    VALUES (_empresa, c.id, _ator, 'resposta_manual');
  RETURN jsonb_build_object('estado','reservada','id',f.id,'reserva',f.reserva,
    'telefone',c.telefone,'vinculo',v.id,'numeroComercial',v.numero_comercial);
END $function$;

CREATE OR REPLACE FUNCTION public.mimo_receber_whatsapp(_vinculo uuid, _owner uuid, _token_sha256 text, _message_id text, _telefone text, _nome text, _texto text, _contato_em timestamp with time zone, _from_me boolean, _referencia jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e uuid; l uuid; n text; binding public.mimo_whatsapp_vinculos; pessoal boolean := false;
BEGIN
 SELECT * INTO binding FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND ativo AND owner_id=_owner AND token_sha256=_token_sha256;
 IF binding.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=binding.empresa_id AND slug='mimo' AND ativa)
 OR NOT (public.tem_papel_empresa(binding.empresa_id,binding.confirmado_por,ARRAY['administrador']::public.empresa_papel[])
   OR (binding.instancia_id IS NULL AND binding.finalidade IS NOT DISTINCT FROM 'fechamento' AND binding.confirmado_por=_owner
     AND public.tem_papel_empresa(binding.empresa_id,_owner,ARRAY['vendedor']::public.empresa_papel[])))
 THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 n:=public.mimo_normalizar_telefone(_telefone);
 IF n IS NULL OR public.mimo_comercial_telefone_interno(binding.empresa_id,n) THEN RETURN NULL; END IF;
 -- First personal reply can race with the first manual send, before either has a config row.
 IF NOT public.tem_papel_empresa(binding.empresa_id,binding.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN
  INSERT INTO public.mimo_agente_config(empresa_id,atualizado_por)
   VALUES(binding.empresa_id,_owner) ON CONFLICT DO NOTHING;
 END IF;
 PERFORM 1 FROM public.mimo_agente_config WHERE empresa_id=binding.empresa_id FOR UPDATE;
 -- Re-read after the same config mutex used by manual sends and the agent worker.
 SELECT * INTO binding FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND ativo AND owner_id=_owner AND token_sha256=_token_sha256 FOR UPDATE;
 IF binding.id IS NULL THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 IF NOT public.tem_papel_empresa(binding.empresa_id,binding.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN
  IF binding.instancia_id IS NOT NULL OR binding.finalidade IS DISTINCT FROM 'fechamento' OR binding.confirmado_por IS DISTINCT FROM _owner
   THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
  PERFORM 1 FROM public.empresa_membros WHERE empresa_id=binding.empresa_id AND user_id=_owner AND ativo AND papel='vendedor' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
  pessoal := true;
 END IF;
 -- A seller's private line cannot feed the agent pilot or seed the first-contact table.
 IF NOT pessoal THEN
  IF public.mimo_agente_receber_piloto(_vinculo,_owner,_token_sha256,_message_id,_telefone,_texto,_contato_em,_from_me) THEN RETURN NULL; END IF;
  e:=binding.empresa_id;
  INSERT INTO public.mimo_agente_contatos VALUES(e,n,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_contato_em) ON CONFLICT DO NOTHING;
 END IF;
 l:=public.mimo_receber_whatsapp_comercial(_vinculo,_owner,_token_sha256,_message_id,_telefone,_nome,_texto,_contato_em,_from_me);
 IF NOT pessoal AND _referencia IS NOT NULL AND jsonb_typeof(_referencia)='object' AND length(_referencia::text)<2000 AND length(_referencia->>'id') BETWEEN 1 AND 200
 AND _referencia->>'fonte'='metadado_whatsapp' AND _referencia->>'url' ~ '^https://([a-zA-Z0-9-]+\.)*(facebook\.com|instagram\.com|fb\.me)/' THEN
  UPDATE public.mimo_whatsapp_eventos SET referencia_anuncio=coalesce(referencia_anuncio,_referencia) WHERE vinculo_id=_vinculo AND message_id=_message_id;
 END IF;
 RETURN l;
END $function$;

CREATE OR REPLACE FUNCTION public.mimo_receber_whatsapp_comercial(_vinculo uuid, _owner uuid, _token_sha256 text, _message_id text, _telefone text, _nome text, _texto text, _contato_em timestamp with time zone, _from_me boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.mimo_whatsapp_vinculos; n text; l uuid; evento uuid; pessoal boolean := false;
BEGIN
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND ativo AND owner_id=_owner AND token_sha256=_token_sha256 FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 PERFORM 1 FROM public.empresas WHERE id=v.empresa_id AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 IF NOT public.tem_papel_empresa(v.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN
  IF v.instancia_id IS NOT NULL OR v.finalidade IS DISTINCT FROM 'fechamento' OR v.confirmado_por IS DISTINCT FROM _owner
   THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
  PERFORM 1 FROM public.empresa_membros WHERE empresa_id=v.empresa_id AND user_id=_owner AND ativo AND papel='vendedor' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=_owner AND encode(extensions.digest(uazapi_instance_token,'sha256'),'hex')=_token_sha256 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
  pessoal := true;
 END IF;
 IF coalesce(length(_message_id),0) NOT BETWEEN 1 AND 200 OR _texto IS NULL OR length(_texto)>10000 OR _contato_em IS NULL OR NOT isfinite(_contato_em) OR _contato_em>now()+interval '5 minutes' OR _from_me IS NULL THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 n:=public.mimo_normalizar_telefone(_telefone);
 IF n IS NULL OR public.mimo_comercial_telefone_interno(v.empresa_id,n) THEN RETURN NULL; END IF;
 -- Serializes the same canonical contact across all commercial numbers.
 PERFORM pg_advisory_xact_lock(hashtextextended(v.empresa_id::text||n,0));
 IF pessoal THEN
  IF EXISTS(SELECT 1 FROM public.mimo_agente_conversas WHERE empresa_id=v.empresa_id AND telefone=n AND piloto)
    OR EXISTS(SELECT 1 FROM public.mimo_agente_config cfg JOIN public.mimo_agente_versoes av
      ON av.empresa_id=cfg.empresa_id AND av.versao=cfg.publicada WHERE cfg.empresa_id=v.empresa_id
      AND coalesce(av.config->'pilotos','[]'::jsonb) ? n) THEN RETURN NULL; END IF;
  SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND telefone_normalizado=n FOR UPDATE;
  IF l IS NULL THEN
   SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND id=public.mimo_revenda_lead_por_telefone(v.empresa_id,n) FOR UPDATE;
  END IF;
  -- Do not retain unrelated traffic from a personal line or retroactively attach duplicate events.
  IF l IS NULL THEN RETURN NULL; END IF;
 END IF;
 INSERT INTO public.mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,direcao,texto,contato_em)
 VALUES(v.empresa_id,v.id,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_texto,_contato_em)
 ON CONFLICT(vinculo_id,message_id) DO NOTHING RETURNING id INTO evento;
 IF evento IS NULL THEN SELECT lead_id INTO l FROM public.mimo_whatsapp_eventos WHERE vinculo_id=v.id AND message_id=_message_id; RETURN l; END IF;
 IF NOT pessoal THEN
  SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND telefone_normalizado=n FOR UPDATE;
  IF l IS NULL THEN
   SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND id=public.mimo_revenda_lead_por_telefone(v.empresa_id,n) FOR UPDATE;
  END IF;
 END IF;
 -- Unclassified existing bindings keep their previously authorized entry semantics until reviewed.
 -- Every new binding has explicit purpose; closing NEVER creates a lead, even with ad evidence.
 IF NOT pessoal AND NOT _from_me AND l IS NULL AND (v.finalidade='entrada' OR v.finalidade IS NULL) THEN
  INSERT INTO public.mimo_leads(empresa_id,nome_empresa,nome_contato,telefone,origem,entrada_em,created_by,primeiro_contato_whatsapp_em,ultimo_contato_whatsapp_em)
  VALUES(v.empresa_id,CASE WHEN length(btrim(coalesce(_nome,'')))>=2 THEN left(btrim(_nome),200) ELSE n END,coalesce(left(_nome,200),''),n,'whatsapp',_contato_em,v.confirmado_por,_contato_em,_contato_em)
  ON CONFLICT(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL DO UPDATE SET
  primeiro_contato_whatsapp_em=least(public.mimo_leads.primeiro_contato_whatsapp_em,EXCLUDED.primeiro_contato_whatsapp_em),ultimo_contato_whatsapp_em=greatest(public.mimo_leads.ultimo_contato_whatsapp_em,EXCLUDED.ultimo_contato_whatsapp_em) RETURNING id INTO l;
 ELSIF l IS NOT NULL THEN
  UPDATE public.mimo_leads SET primeiro_contato_whatsapp_em=least(primeiro_contato_whatsapp_em,_contato_em),ultimo_contato_whatsapp_em=greatest(ultimo_contato_whatsapp_em,_contato_em) WHERE id=l;
 END IF;
 IF pessoal AND NOT _from_me THEN
  -- Keep personal replies in manual attendance; still run the existing stop and recovery triggers.
  INSERT INTO public.mimo_agente_conversas(empresa_id,lead_id,vinculo_id,telefone,piloto,estado)
   SELECT v.empresa_id,l,v.id,telefone_normalizado,false,'humano' FROM public.mimo_leads
   WHERE empresa_id=v.empresa_id AND id=l AND telefone_normalizado IS NOT NULL ON CONFLICT DO NOTHING;
  UPDATE public.mimo_agente_conversas SET estado='humano',motivo='resposta_manual'
   WHERE empresa_id=v.empresa_id AND lead_id=l AND NOT piloto AND estado='agente';
 END IF;
 UPDATE public.mimo_whatsapp_eventos SET lead_id=l WHERE id=evento;
 RETURN l;
END $function$;
