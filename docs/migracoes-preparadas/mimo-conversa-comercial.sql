-- Prepared for the repository's Drizzle workflow. Does not enable automatic sends.
CREATE FUNCTION public.mimo_conversa_comercial(
  _empresa uuid, _ator uuid, _lead uuid, _acao text, _p jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.mimo_agente_config;
  c public.mimo_agente_conversas;
  f public.mimo_agente_fila;
  v public.mimo_whatsapp_vinculos;
  lead_telefone text;
  linha uuid;
  texto text := btrim(_p->>'texto');
  solicitacao_id uuid := (_p->>'solicitacao')::uuid;
BEGIN
  PERFORM 1 FROM public.empresas WHERE id = _empresa AND slug = 'mimo' AND ativa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversa indisponível.'; END IF;
  IF NOT public.tem_papel_empresa(_empresa, _ator, ARRAY['administrador','gestor','vendedor']::public.empresa_papel[]) THEN
    RAISE EXCEPTION 'Conversa indisponível.';
  END IF;

  -- The existing agent worker and webhook serialize conversation changes through this row.
  INSERT INTO public.mimo_agente_config (empresa_id, atualizado_por)
    VALUES (_empresa, _ator) ON CONFLICT DO NOTHING;
  SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id = _empresa FOR UPDATE;
  PERFORM 1 FROM public.empresa_membros
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

  linha := c.vinculo_id;
  IF linha IS NULL THEN
    SELECT vinculo_id INTO linha FROM public.mimo_whatsapp_eventos
      WHERE empresa_id = _empresa AND lead_id = _lead
      ORDER BY contato_em DESC, id DESC LIMIT 1;
  END IF;
  IF linha IS NULL THEN
    SELECT (array_agg(id))[1] INTO linha FROM public.mimo_whatsapp_vinculos
      WHERE empresa_id = _empresa AND ativo AND finalidade = 'entrada'
        AND public.tem_papel_empresa(_empresa, confirmado_por, ARRAY['administrador']::public.empresa_papel[])
      HAVING count(*) = 1;
  END IF;
  SELECT * INTO v FROM public.mimo_whatsapp_vinculos
    WHERE id = linha AND empresa_id = _empresa AND ativo FOR SHARE;
  IF v.id IS NULL OR NOT public.tem_papel_empresa(_empresa, v.confirmado_por, ARRAY['administrador']::public.empresa_papel[]) THEN
    IF _acao = 'autorizar' THEN RETURN 'false'; END IF;
    RETURN jsonb_build_object('estado', 'linha_indisponivel');
  END IF;

  IF _acao = 'autorizar' THEN
    IF v.token_sha256 IS DISTINCT FROM _p->>'tokenHash' THEN RETURN 'false'; END IF;
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
    reserva, reservada_em, resposta, solicitado_por, solicitacao)
    VALUES (_empresa, c.id, c.sequencia, coalesce(cfg.publicada, 0), clock_timestamp(), 'reservada',
      gen_random_uuid(), clock_timestamp(), texto, _ator, solicitacao_id) RETURNING * INTO f;
  INSERT INTO public.mimo_agente_historico (empresa_id, conversa_id, ator_id, acao)
    VALUES (_empresa, c.id, _ator, 'resposta_manual');
  RETURN jsonb_build_object('estado','reservada','id',f.id,'reserva',f.reserva,
    'telefone',c.telefone,'vinculo',v.id,'numeroComercial',v.numero_comercial);
END $$;

REVOKE ALL ON FUNCTION public.mimo_conversa_comercial(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_conversa_comercial(uuid,uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
