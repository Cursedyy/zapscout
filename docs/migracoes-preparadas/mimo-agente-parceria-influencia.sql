-- Prepared only. Verify the shared backup and apply through the official migrator before relying on it.
-- Requires mimo-agente-recusa-revenda.sql (0055). No backfill, grants, new endpoints or contact edits.
-- 1) Generic "marketing team" requests receive the official influencer form and are commercially
--    disqualified (sem_perfil) in the same final send authorization as resale refusals.
-- 2) Any reservation of a lead that is no longer pending persistently blocks and cancels the
--    automatic follow-ups of its conversation, covering legacy and racing states.
DO $patch$
DECLARE
  worker text := pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure);
  validar_follow text := pg_get_functiondef('public.mimo_follow_validar()'::regprocedure);
  form constant text := 'Para parceria como influencer, preencha nosso formulário: https://zapscout.com.br/influenciadores';
  a_reserva constant text := $m$'encerramentoRevenda',true,$m$;
  a_motivo constant text := $m$IF _p->'resultado'->>'motivo'='falta_interesse' THEN$m$;
  a_resposta constant text := $m$OR _p->'resultado'->>'resposta' IS DISTINCT FROM 'Tudo bem, agradeço pelo retorno!'$m$;
  a_lead constant text := $m$qualificacao='nao_qualificado',motivo_perda_codigo='falta_interesse'$m$;
  a_hist constant text := $m$jsonb_build_object('origem','ia','motivo','falta_interesse','fila',f.id)$m$;
  a_conv constant text := $m$SET estado='pausada',motivo='falta_interesse',followup_bloqueado=true$m$;
  a_fila constant text := $m$SET estado='cancelada',motivo='falta_interesse',updated_at$m$;
  a_acao constant text := $m$'encerrar_revenda',jsonb_build_object('fila',f.id,'motivo','falta_interesse')$m$;
  a_cancel constant text := $m$IF NOT coalesce(permitido,false) THEN UPDATE public.mimo_agente_fila SET estado='cancelada' WHERE id=f.id; RETURN NULL; END IF;$m$;
  a_valid constant text := $m$AND l.etapa='perdido' AND l.motivo_perda_codigo='falta_interesse')$m$;
  m constant text := $m$(_p->'resultado'->>'motivo')$m$;
BEGIN
  IF (length(worker)-length(replace(worker,a_reserva,''))) <> length(a_reserva)
    OR (length(worker)-length(replace(worker,a_motivo,''))) <> length(a_motivo)
    OR (length(worker)-length(replace(worker,a_resposta,''))) <> length(a_resposta)
    OR (length(worker)-length(replace(worker,a_lead,''))) <> length(a_lead)
    OR (length(worker)-length(replace(worker,a_hist,''))) <> length(a_hist)
    OR (length(worker)-length(replace(worker,a_conv,''))) <> length(a_conv)
    OR (length(worker)-length(replace(worker,a_fila,''))) <> length(a_fila)
    OR (length(worker)-length(replace(worker,a_acao,''))) <> length(a_acao)
    OR (length(worker)-length(replace(worker,a_cancel,''))) <> length(a_cancel)
    OR (length(validar_follow)-length(replace(validar_follow,a_valid,''))) <> length(a_valid)
  THEN RAISE EXCEPTION 'Definições do atendimento incompatíveis com parceria de influência'; END IF;

  worker := replace(worker,a_reserva,$n$'encerramentoRevenda',true,'parceriaInfluencia',true,$n$);
  worker := replace(worker,a_motivo,$n$IF _p->'resultado'->>'motivo' IN ('falta_interesse','parceria_influencia') THEN$n$);
  worker := replace(worker,a_resposta,format($n$OR _p->'resultado'->>'resposta' IS DISTINCT FROM (CASE _p->'resultado'->>'motivo'
     WHEN 'falta_interesse' THEN 'Tudo bem, agradeço pelo retorno!' ELSE %L END)$n$, form));
  worker := replace(worker,a_lead,$n$qualificacao='nao_qualificado',motivo_perda_codigo=CASE _p->'resultado'->>'motivo' WHEN 'falta_interesse' THEN 'falta_interesse' ELSE 'sem_perfil' END$n$);
  worker := replace(worker,a_hist,$n$jsonb_build_object('origem','ia','motivo',$n$||m||$n$,'fila',f.id)$n$);
  worker := replace(worker,a_conv,$n$SET estado='pausada',motivo=$n$||m||$n$,followup_bloqueado=true$n$);
  worker := replace(worker,a_fila,$n$SET estado='cancelada',motivo=$n$||m||$n$,updated_at$n$);
  worker := replace(worker,a_acao,$n$CASE WHEN $n$||m||$n$='falta_interesse' THEN 'encerrar_revenda' ELSE 'parceria_influencia' END,jsonb_build_object('fila',f.id,'motivo',$n$||m||$n$)$n$);
  -- Persistent guard: a reservation of a non-pending lead blocks every automatic follow-up.
  worker := replace(worker,a_cancel,$n$IF NOT c.piloto AND NOT EXISTS(SELECT 1 FROM public.mimo_leads WHERE id=c.lead_id AND empresa_id=c.empresa_id
    AND etapa IN ('novo','contato_realizado') AND qualificacao='pendente') THEN
   UPDATE public.mimo_agente_conversas SET followup_bloqueado=true WHERE id=c.id AND NOT followup_bloqueado;
   UPDATE public.mimo_agente_fila SET estado='cancelada',motivo='lead_desqualificado',updated_at=clock_timestamp()
    WHERE conversa_id=c.id AND empresa_id=c.empresa_id AND id<>f.id AND estado='pendente' AND motivo IN ('followup_2h','retomada_historica');
  END IF;
  $n$||a_cancel);
  EXECUTE worker;

  -- Actorless terminal cancellation of internal follow-ups for any commercially disqualified lost lead.
  EXECUTE replace(validar_follow,a_valid,$n$AND l.etapa='perdido' AND l.qualificacao='nao_qualificado' AND l.motivo_perda_codigo IN ('falta_interesse','sem_perfil'))$n$);
END $patch$;
