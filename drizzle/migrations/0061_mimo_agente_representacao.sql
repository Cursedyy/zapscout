-- Extend the existing atomic commercial disqualification to explicit representation.
DO $patch$
DECLARE
  worker text := pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure);
  form constant text := 'Para ser representante, preencha nosso formulário: https://zapscout.com.br/representantes';
  reserva constant text := $m$'parceriaInfluencia',true,$m$;
  motivos constant text := $m$IN ('falta_interesse','parceria_influencia') THEN$m$;
  resposta constant text := $m$WHEN 'falta_interesse' THEN 'Tudo bem, agradeço pelo retorno!' ELSE 'Para parceria$m$;
  historico constant text := $m$THEN 'encerrar_revenda' ELSE 'parceria_influencia' END$m$;
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[reserva,motivos,resposta,historico]) a(trecho)
    WHERE length(worker)-length(replace(worker,a.trecho,'')) <> length(a.trecho)) THEN
    RAISE EXCEPTION 'Definição incompatível com encerramento por representação';
  END IF;
  worker := replace(worker,reserva,reserva||$m$'representacao',true,$m$);
  worker := replace(worker,motivos,$m$IN ('falta_interesse','parceria_influencia','representacao') THEN$m$);
  worker := replace(worker,resposta,format($m$WHEN 'falta_interesse' THEN 'Tudo bem, agradeço pelo retorno!'
     WHEN 'representacao' THEN %L ELSE 'Para parceria$m$,form));
  worker := replace(worker,historico,$m$THEN 'encerrar_revenda' WHEN (_p->'resultado'->>'motivo')='representacao'
     THEN 'representacao' ELSE 'parceria_influencia' END$m$);
  EXECUTE worker;
END $patch$;

--> statement-breakpoint
-- Repair only pending sales leads whose current inbound turn received the exact approved form.
WITH candidatos AS MATERIALIZED (
  SELECT c.id conversa, c.lead_id, c.empresa_id, f.id fila
  FROM public.mimo_agente_conversas c JOIN public.mimo_agente_fila f
    ON f.conversa_id=c.id AND f.sequencia=c.sequencia AND f.empresa_id=c.empresa_id
  JOIN public.empresas e ON e.id=c.empresa_id AND e.slug='mimo' AND e.ativa
  WHERE NOT c.piloto AND c.estado='agente' AND f.estado='enviada' AND f.message_id IS NOT NULL
    AND f.resposta='Para ser representante, preencha nosso formulário: https://zapscout.com.br/representantes'
  FOR UPDATE OF c
), leads AS (
  UPDATE public.mimo_leads l SET etapa='perdido',qualificacao='nao_qualificado',motivo_perda_codigo='sem_perfil'
  FROM candidatos c WHERE l.id=c.lead_id AND l.empresa_id=c.empresa_id
    AND l.qualificacao='pendente' AND l.etapa IN ('novo','contato_realizado')
  RETURNING c.*
), conversas AS (
  UPDATE public.mimo_agente_conversas c SET estado='pausada',motivo='representacao',followup_bloqueado=true,updated_at=clock_timestamp()
  FROM leads l WHERE c.id=l.conversa RETURNING l.*
), lembretes AS (
  UPDATE public.mimo_agente_fila f SET estado='cancelada',motivo='representacao',updated_at=clock_timestamp()
  FROM conversas c WHERE f.conversa_id=c.conversa AND f.empresa_id=c.empresa_id
    AND f.estado IN ('pendente','reservada') AND f.motivo IN ('followup_2h','retomada_historica')
)
INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados)
SELECT empresa_id,conversa,'representacao',jsonb_build_object('fila',fila,'motivo','representacao','recuperacao',true)
FROM conversas;
