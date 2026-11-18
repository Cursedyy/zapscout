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

-- Prepared for Drizzle. Only new activity can create internal CRM follow-ups.
ALTER TABLE public.mimo_agente_config
  ADD COLUMN followups_painel_desde timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.mimo_lead_followups
  ADD COLUMN origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'ia'));

CREATE FUNCTION public.mimo_followups_ia_agendar()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cfg public.mimo_agente_config;
  candidato record;
  feito public.mimo_lead_followups;
  operador uuid;
  responsavel uuid;
  ident uuid;
  novo_prazo timestamptz;
  obs text;
  prazo_cliente text[];
  dias integer;
  total int := 0;
  agora timestamptz := statement_timestamp();
BEGIN
  SELECT c.* INTO cfg
  FROM public.mimo_agente_config c JOIN public.empresas e ON e.id = c.empresa_id
  WHERE e.slug = 'mimo' AND e.ativa AND c.modo = 'ativo'
  FOR SHARE OF e, c;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- A missing seller sends the internal review to an active commercial manager.
  SELECT m.user_id INTO operador
  FROM public.empresa_membros m
  WHERE m.empresa_id = cfg.empresa_id AND m.ativo AND m.papel IN ('administrador', 'gestor')
  ORDER BY (m.user_id = cfg.atualizado_por) DESC, m.user_id
  LIMIT 1;

  -- Human edits take precedence. Only retire untouched automatic tasks.
  FOR candidato IN
    SELECT f.id, f.lead_id, f.responsavel_id, to_jsonb(f) AS anterior
    FROM public.mimo_lead_followups f
    JOIN public.mimo_leads l ON l.empresa_id = f.empresa_id AND l.id = f.lead_id
    LEFT JOIN public.mimo_agente_conversas c ON c.empresa_id = l.empresa_id AND c.lead_id = l.id AND NOT c.piloto
    WHERE f.empresa_id = cfg.empresa_id AND f.origem = 'ia' AND f.estado = 'pendente' AND f.versao = 1
      AND public.mimo_follow_pode_lead(f.empresa_id, f.lead_id, f.responsavel_id)
      AND (l.etapa IN ('perdido', 'pedido_fechado') OR c.estado = 'bloqueada'
        OR (SELECT p.status FROM public.mimo_tira_pedidos p WHERE p.empresa_id = l.empresa_id AND p.lead_id = l.id
          ORDER BY p.updated_at DESC, p.id DESC LIMIT 1) IN ('faturado', 'enviado', 'entregue', 'cancelado'))
    ORDER BY f.id LIMIT 32 FOR UPDATE OF f SKIP LOCKED
  LOOP
    UPDATE public.mimo_lead_followups SET estado = 'cancelado', versao = versao + 1, updated_at = agora
      WHERE id = candidato.id RETURNING * INTO feito;
    INSERT INTO public.mimo_lead_followup_historico
      (empresa_id, follow_id, lead_id, ator_id, acao, operacao_id, requisicao, anterior, atual)
      VALUES (cfg.empresa_id, feito.id, feito.lead_id, feito.responsavel_id, 'cancelar_ia', gen_random_uuid(),
        jsonb_build_object('origem', 'ia', 'motivo', 'fluxo_encerrado'), candidato.anterior, to_jsonb(feito));
  END LOOP;

  FOR candidato IN
    SELECT l.id, l.responsavel_id, l.etapa, l.updated_at AS versao_lead,
      c.estado AS conversa_estado, c.motivo, c.resumo,
      ultimo.id AS evento, ultimo.direcao, entrada.texto AS entrada_texto, entrada.contato_em AS entrada_em,
      p.id AS pedido, p.status AS pedido_status, p.documento #>> '{pagamento,forma}' AS pedido_pagamento,
      coalesce(jsonb_typeof(p.pix) = 'object', false) AS pix_registrado,
      s.chave
    FROM public.mimo_leads l
    LEFT JOIN public.mimo_agente_conversas c ON c.empresa_id = l.empresa_id AND c.lead_id = l.id AND NOT c.piloto
    LEFT JOIN LATERAL (
      SELECT x.id, x.direcao, x.contato_em
      FROM public.mimo_whatsapp_eventos x WHERE x.empresa_id = l.empresa_id AND x.lead_id = l.id
      ORDER BY x.contato_em DESC, x.created_at DESC, x.id DESC LIMIT 1
    ) ultimo ON true
    LEFT JOIN LATERAL (
      SELECT x.texto, x.contato_em
      FROM public.mimo_whatsapp_eventos x
      WHERE x.empresa_id = l.empresa_id AND x.lead_id = l.id AND x.direcao = 'recebida'
      ORDER BY x.contato_em DESC, x.created_at DESC, x.id DESC LIMIT 1
    ) entrada ON true
    LEFT JOIN LATERAL (
      SELECT x.id, x.versao, x.status, x.documento, x.pix, x.updated_at
      FROM public.mimo_tira_pedidos x
      WHERE x.empresa_id = l.empresa_id AND x.lead_id = l.id
      ORDER BY x.updated_at DESC, x.id DESC LIMIT 1
    ) p ON true
    CROSS JOIN LATERAL (
      SELECT md5(concat_ws('|', l.id, extract(epoch FROM l.updated_at), ultimo.id, p.id, p.versao, c.estado, c.motivo))::uuid AS chave,
        greatest(l.updated_at, ultimo.contato_em, p.updated_at) AS atividade
    ) s
    WHERE l.empresa_id = cfg.empresa_id AND l.etapa IN ('novo', 'contato_realizado', 'em_negociacao')
      AND (l.responsavel_id IS NOT NULL OR operador IS NOT NULL)
      AND coalesce(c.estado, '') <> 'bloqueada'
      AND coalesce(c.motivo, '') NOT IN ('parar', 'consumo_proprio', 'suporte')
      AND coalesce(lower(entrada.texto), '') !~ '\m(pare de (me )?(mandar|enviar)|n[aã]o (me )?(mande|envie) mais|descadastrar|remova meu (contato|n[uú]mero)|desisto)\M'
      AND coalesce(p.status, '') NOT IN ('faturado', 'enviado', 'entregue', 'cancelado')
      AND s.atividade >= greatest(cfg.followups_painel_desde, agora - interval '7 days')
      AND s.atividade <= agora - interval '2 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.mimo_lead_followups f
        WHERE f.empresa_id = l.empresa_id AND f.lead_id = l.id AND f.estado = 'pendente')
      AND NOT EXISTS (SELECT 1 FROM public.mimo_lead_followup_historico h
        WHERE h.empresa_id = l.empresa_id AND h.operacao_id = s.chave)
    ORDER BY s.atividade, l.id
    LIMIT 32
  LOOP
    responsavel := candidato.responsavel_id;
    IF responsavel IS NULL OR NOT public.mimo_follow_pode_lead(cfg.empresa_id, candidato.id, responsavel) THEN
      responsavel := operador;
    END IF;
    IF responsavel IS NULL THEN CONTINUE; END IF;

    -- Same membership/lead lock order as manual follow-ups. Do not wait behind other writes.
    PERFORM 1 FROM public.empresa_membros
      WHERE empresa_id = cfg.empresa_id AND user_id = responsavel AND ativo FOR SHARE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM 1 FROM public.mimo_leads
      WHERE empresa_id = cfg.empresa_id AND id = candidato.id AND etapa = candidato.etapa
        AND updated_at = candidato.versao_lead
        AND responsavel_id IS NOT DISTINCT FROM candidato.responsavel_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR NOT public.mimo_follow_pode_lead(cfg.empresa_id, candidato.id, responsavel) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.mimo_lead_followups f
        WHERE f.empresa_id = cfg.empresa_id AND f.lead_id = candidato.id AND f.estado = 'pendente')
      OR EXISTS (SELECT 1 FROM public.mimo_lead_followup_historico h
        WHERE h.empresa_id = cfg.empresa_id AND h.operacao_id = candidato.chave) THEN CONTINUE; END IF;

    -- This uses the accepted agent classification and current commercial process, never a generated action.
    prazo_cliente := CASE WHEN candidato.entrada_em >= cfg.followups_painel_desde
      THEN regexp_match(lower(left(candidato.entrada_texto, 2000)),
        '(?:retorn|fal|cham|procur|volt|contat)[^.!?]{0,36}(?:daqui a? |em )([1-9]|[12][0-9]|30) dias?(?:[^a-z]|$)') END;
    dias := 1;
    IF prazo_cliente IS NOT NULL THEN
      dias := prazo_cliente[1]::integer;
      obs := 'Retomar a conversa no prazo pedido pelo lead. Confira a última mensagem.';
    ELSIF candidato.pedido_status = 'confirmado' AND candidato.pedido_pagamento = 'pix'
      AND NOT candidato.pix_registrado THEN
      obs := 'Acompanhar o PIX com o Administrativo antes do faturamento.';
    ELSIF candidato.pedido_status = 'confirmado'
      OR (candidato.pedido_status = 'aguardando_pagamento' AND candidato.pix_registrado) THEN
      obs := 'Conferir com o Administrativo a próxima etapa do pedido e o faturamento.';
    ELSIF candidato.pedido_status = 'aguardando_pagamento' THEN
      obs := 'Acompanhar o pagamento do pedido antes de encaminhar para faturamento.';
    ELSIF candidato.motivo = 'pre_qualificacao_pendente_revisao' THEN
      obs := 'Revisar a pré-qualificação da IA e conferir o interesse antes de avançar com a proposta.';
    ELSIF candidato.conversa_estado = 'humano' AND coalesce(candidato.motivo, '') <> '' THEN
      obs := 'Revisar a conversa encaminhada pelo agente e dar continuidade ao atendimento.';
    ELSIF candidato.etapa = 'em_negociacao' OR candidato.pedido_status = 'rascunho' THEN
      dias := 2;
      obs := 'Retomar a negociação e conferir as pendências da proposta ou do pedido.';
    ELSIF candidato.resumo LIKE 'Assunto: revenda.%' AND candidato.direcao = 'enviada' THEN
      dias := 2;
      obs := 'Revisar a conversa de revenda e retomar os dados ou dúvidas que ficaram pendentes.';
    ELSIF candidato.direcao = 'recebida' OR candidato.evento IS NULL THEN
      obs := 'Revisar o cadastro e responder ao lead pela conversa no painel.';
    ELSE
      dias := 2;
      obs := 'Acompanhar a resposta do lead e registrar a próxima etapa da conversa.';
    END IF;
    IF candidato.responsavel_id IS DISTINCT FROM responsavel THEN
      obs := 'Defina quem vai atender este lead. ' || obs;
    END IF;
    novo_prazo := ((agora AT TIME ZONE 'America/Sao_Paulo')::date + dias + time '09:00')
      AT TIME ZONE 'America/Sao_Paulo';
    IF prazo_cliente IS NULL THEN
      novo_prazo := novo_prazo + CASE extract(isodow FROM novo_prazo AT TIME ZONE 'America/Sao_Paulo')
        WHEN 6 THEN interval '2 days' WHEN 7 THEN interval '1 day' ELSE interval '0 days' END;
    ELSE
      novo_prazo := greatest(agora + interval '5 minutes', candidato.entrada_em + make_interval(days => dias));
    END IF;

    ident := gen_random_uuid();
    INSERT INTO public.mimo_lead_followups(id, empresa_id, lead_id, responsavel_id, prazo, observacao, origem)
      VALUES (ident, cfg.empresa_id, candidato.id, responsavel, novo_prazo, obs, 'ia') RETURNING * INTO feito;
    INSERT INTO public.mimo_lead_followup_historico
      (empresa_id, follow_id, lead_id, ator_id, acao, operacao_id, requisicao, atual)
      VALUES (cfg.empresa_id, ident, candidato.id, responsavel, 'agendar_ia', candidato.chave,
        jsonb_build_object('origem', 'ia', 'evento', candidato.evento, 'pedido', candidato.pedido, 'etapa', candidato.etapa),
        to_jsonb(feito));
    total := total + 1;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.mimo_followups_ia_agendar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_followups_ia_agendar() TO service_role;
