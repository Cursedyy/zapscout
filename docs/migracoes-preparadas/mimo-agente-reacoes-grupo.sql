-- Uma reação de WhatsApp é registrada junto ao aviso aceito que originou o atendimento.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mimo_agente_alertas
  ADD COLUMN IF NOT EXISTS atendido_whatsapp_em timestamptz,
  ADD COLUMN IF NOT EXISTS reacao_atendimento_id text;

CREATE OR REPLACE FUNCTION public.mimo_lead_prequalificado_ia(_empresa uuid, _lead uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mimo_agente_conversas c
    JOIN public.mimo_agente_fila f ON f.conversa_id = c.id AND f.empresa_id = c.empresa_id
    WHERE c.empresa_id = _empresa AND c.lead_id = _lead
      AND NOT c.piloto AND c.estado = 'humano' AND c.revisao_humana <> 'rejeitada'
      AND f.estado = 'enviada' AND f.message_id IS NOT NULL AND f.solicitado_por IS NULL
      AND f.resultado->>'estado' = 'humano'
      AND f.resultado->>'motivo' = 'pre_qualificacao_pendente_revisao'
      AND f.resultado->>'resumo' = c.resumo
      AND NOT EXISTS (
        SELECT 1 FROM public.mimo_agente_alertas a
        WHERE a.empresa_id = _empresa AND a.lead_id = _lead AND a.atendido_whatsapp_em IS NOT NULL
          AND a.created_at >= f.inicio_em
      )
  );
$$;

REVOKE ALL ON FUNCTION public.mimo_lead_prequalificado_ia(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mimo_quentes_reacoes(_acao text, _p jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.mimo_agente_observacao_config;
  v public.mimo_whatsapp_vinculos;
  aviso public.mimo_agente_alertas;
  candidato record;
  candidatos uuid[];
  desde timestamptz;
  ocorrido timestamptz;
  prefixo text;
  alvo text;
  total integer := 0;
BEGIN
  SELECT cfg.* INTO c
  FROM public.mimo_agente_observacao_config cfg
  JOIN public.empresas e ON e.id = cfg.empresa_id AND e.slug = 'mimo' AND e.ativa
  WHERE cfg.ativo AND cfg.grupo_status = 'ativo' AND cfg.grupo_nome = 'leads quentes'
    AND cfg.grupo_jid = cfg.destino
  FOR SHARE OF cfg;
  IF NOT FOUND OR NOT public.tem_papel_empresa(
      c.empresa_id, c.atualizado_por, ARRAY['administrador','gestor']::public.empresa_papel[]
    ) THEN RETURN NULL; END IF;

  SELECT * INTO v FROM public.mimo_whatsapp_vinculos
  WHERE id = c.vinculo_id AND empresa_id = c.empresa_id AND ativo FOR SHARE;
  IF NOT FOUND OR NOT public.tem_papel_empresa(
      c.empresa_id, v.confirmado_por, ARRAY['administrador']::public.empresa_papel[]
    ) THEN RETURN NULL; END IF;

  IF _acao = 'consultar' THEN
    SELECT min(a.created_at) INTO desde
    FROM public.mimo_agente_alertas a JOIN public.mimo_leads l
      ON l.id = a.lead_id AND l.empresa_id = a.empresa_id AND l.etapa <> 'perdido'
    WHERE a.empresa_id = c.empresa_id AND a.vinculo_id = c.vinculo_id
      AND a.config_versao = c.versao AND a.destino = c.destino AND a.created_at >= c.inicio_em
      AND a.tipo = 'lead' AND a.estado = 'aceita' AND a.message_id IS NOT NULL
      AND a.atendido_whatsapp_em IS NULL;
    IF desde IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('empresa', c.empresa_id, 'vinculo', c.vinculo_id,
      'versao', c.versao, 'jid', c.grupo_jid, 'desde', desde);
  END IF;

  IF _acao <> 'registrar'
    OR _p->>'empresa' IS DISTINCT FROM c.empresa_id::text
    OR _p->>'vinculo' IS DISTINCT FROM c.vinculo_id::text
    OR _p->>'versao' IS DISTINCT FROM c.versao::text
    OR _p->>'jid' IS DISTINCT FROM c.grupo_jid
    OR jsonb_typeof(_p->'reacoes') IS DISTINCT FROM 'array'
  THEN RETURN '0'::jsonb; END IF;
  IF jsonb_array_length(_p->'reacoes') > 100 THEN RAISE EXCEPTION 'Lote de reações inválido'; END IF;

  prefixo := regexp_replace(coalesce(v.numero_comercial, ''), '[^0-9]', '', 'g') || ':';
  FOR candidato IN SELECT * FROM jsonb_to_recordset(_p->'reacoes') AS r(id text, alvo text, em bigint)
    ORDER BY r.em, r.id
  LOOP
    IF coalesce(candidato.id, '') !~ '^[a-zA-Z0-9_.:-]{1,200}$'
      OR coalesce(candidato.alvo, '') !~ '^[a-zA-Z0-9_.:-]{1,200}$'
      OR candidato.em IS NULL OR candidato.em NOT BETWEEN 1000000000000 AND
        floor(extract(epoch FROM clock_timestamp() + interval '5 minutes') * 1000)
    THEN CONTINUE; END IF;
    ocorrido := to_timestamp(candidato.em / 1000.0);
    alvo := candidato.alvo;
    IF length(prefixo) > 1 AND starts_with(alvo, prefixo) THEN
      alvo := substr(alvo, length(prefixo) + 1);
    END IF;

    SELECT array_agg(a.id) INTO candidatos
    FROM public.mimo_agente_alertas a
    WHERE a.empresa_id = c.empresa_id AND a.vinculo_id = c.vinculo_id
      AND a.config_versao = c.versao AND a.destino = c.destino
      AND a.tipo = 'lead' AND a.estado = 'aceita' AND a.created_at >= c.inicio_em
      AND ocorrido >= a.created_at - interval '1 second'
      AND (a.message_id IN (candidato.alvo, alvo) OR
           (length(prefixo) > 1 AND a.message_id = prefixo || alvo));
    IF coalesce(cardinality(candidatos), 0) <> 1 THEN CONTINUE; END IF;

    SELECT * INTO aviso FROM public.mimo_agente_alertas
      WHERE id = candidatos[1] AND atendido_whatsapp_em IS NULL FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM 1 FROM public.mimo_leads
      WHERE id = aviso.lead_id AND empresa_id = c.empresa_id AND etapa <> 'perdido' FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE public.mimo_leads SET etapa = 'contato_realizado'
      WHERE id = aviso.lead_id AND empresa_id = c.empresa_id AND etapa = 'novo';
    UPDATE public.mimo_agente_alertas
      SET atendido_whatsapp_em = ocorrido, reacao_atendimento_id = candidato.id
      WHERE id = aviso.id;
    total := total + 1;
  END LOOP;

  RETURN to_jsonb(total);
END;
$$;

REVOKE ALL ON FUNCTION public.mimo_quentes_reacoes(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mimo_quentes_reacoes(text, jsonb) TO service_role;

COMMIT;
