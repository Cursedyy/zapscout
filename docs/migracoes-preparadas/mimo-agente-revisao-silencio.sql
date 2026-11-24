-- Apply through the official migrator after verifying the shared database backup.
-- Internal review only. No qualification, assignment, or customer/provider send.
CREATE OR REPLACE FUNCTION public.mimo_agente_revisao_silencio_agendar()
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH candidatos AS MATERIALIZED (
  SELECT c.id AS conversa, c.empresa_id, f.id AS fila, u.created_at AS enviado_em
  FROM public.mimo_agente_conversas c
  JOIN public.mimo_agente_config cfg ON cfg.empresa_id=c.empresa_id AND cfg.vinculo_id=c.vinculo_id
  JOIN public.empresas emp ON emp.id=c.empresa_id AND emp.ativa
  JOIN public.mimo_leads l ON l.id=c.lead_id AND l.empresa_id=c.empresa_id
  JOIN public.mimo_agente_fila f ON f.conversa_id=c.id AND f.empresa_id=c.empresa_id AND f.sequencia=c.sequencia
  JOIN public.mimo_agente_followup_envios s ON s.fila_id=f.id AND s.empresa_id=c.empresa_id AND s.conversa_id=c.id
  JOIN LATERAL (
    SELECT e.message_id,e.direcao,e.created_at FROM public.mimo_whatsapp_eventos e
    WHERE e.empresa_id=c.empresa_id AND e.lead_id=c.lead_id
    ORDER BY e.created_at DESC,e.id DESC LIMIT 1
  ) u ON u.direcao='enviada' AND u.message_id=f.message_id
  WHERE cfg.modo='ativo' AND c.estado='agente' AND NOT c.piloto AND NOT c.followup_bloqueado
    AND l.qualificacao='pendente' AND l.etapa IN ('novo','contato_realizado') AND l.responsavel_id IS NULL
    AND f.estado='enviada' AND f.solicitado_por IS NULL
    AND u.created_at <= clock_timestamp()-interval '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.mimo_agente_alertas a WHERE a.empresa_id=c.empresa_id AND a.lead_id=c.lead_id
        AND a.tipo='lead' AND a.estado IN ('pendente','reservada','enviando','aceita','incerta')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.mimo_agente_historico h WHERE h.empresa_id=c.empresa_id AND h.conversa_id=c.id
        AND h.acao='sem_resposta_apos_followup' AND h.dados->>'fila'=f.id::text
    )
  ORDER BY u.created_at,c.id
  LIMIT 25 FOR UPDATE OF c SKIP LOCKED
 ), encaminhadas AS (
  UPDATE public.mimo_agente_conversas c
  SET estado='humano', motivo='sem_resposta_apos_followup', updated_at=clock_timestamp()
  FROM candidatos x
  WHERE c.id=x.conversa AND c.empresa_id=x.empresa_id AND c.estado='agente'
  RETURNING c.id,c.empresa_id,x.fila,x.enviado_em
 ), historico AS (
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados)
  SELECT empresa_id,id,'sem_resposta_apos_followup',
    jsonb_build_object('fila',fila,'ultimo_followup_em',enviado_em,'horas_sem_resposta',48)
  FROM encaminhadas
  RETURNING id
 )
 SELECT count(*)::integer FROM historico;
$$;
REVOKE ALL ON FUNCTION public.mimo_agente_revisao_silencio_agendar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_revisao_silencio_agendar() TO service_role;

SELECT cron.schedule(
  'mimo-agente-revisao-silencio',
  '*/5 * * * *',
  'SELECT public.mimo_agente_revisao_silencio_agendar()'
);
