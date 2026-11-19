-- Prepared only. Verify backup and apply through the official migrator before publishing.
-- No backfill, grants, new write endpoints or changes to existing contact records at install time.
DO $patch$
DECLARE
  worker text := pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure);
  entrada text := pg_get_functiondef('public.mimo_agente_enfileirar(uuid,uuid,text,text,text)'::regprocedure);
  validar_follow text := pg_get_functiondef('public.mimo_follow_validar()'::regprocedure);
  reserva constant text := $m$'resumo',c.resumo,'materiais',$m$;
  envio constant text := $m$  IF coalesce(length(_p->'resultado'->>'resposta'),0) NOT BETWEEN 1 AND 800 OR coalesce(_p->'resultado'->>'estado','') NOT IN ('agente','humano','bloqueada') THEN RAISE EXCEPTION 'Resposta inválida'; END IF;$m$;
  optout constant text := $m$IF lower(_texto) ~$m$;
  validar constant text := $m$BEGIN
 IF NOT isfinite(NEW.prazo)$m$;
BEGIN
  IF (length(worker)-length(replace(worker,reserva,''))) <> length(reserva)
    OR (length(worker)-length(replace(worker,envio,''))) <> length(envio)
    OR (length(entrada)-length(replace(entrada,optout,''))) <> length(optout)
    OR (length(validar_follow)-length(replace(validar_follow,validar,''))) <> length(validar)
  THEN RAISE EXCEPTION 'Definições do atendimento incompatíveis com encerramento de revenda'; END IF;

  -- Commercial refusal clauses are not global opt-out. Other clauses still use the existing check.
  EXECUTE replace(entrada,optout,$new$IF regexp_replace(lower(_texto),
    '\m(n[ãa]o quero mais revender|desisto da revenda)\M', '', 'g') ~$new$);

  -- A terminal cancellation must remain possible if the original assignee became inactive.
  -- Only the worker's actorless transition can take this branch, without changing task content.
  EXECUTE replace(validar_follow,validar,$new$BEGIN
 IF TG_OP='UPDATE' AND auth.uid() IS NULL AND OLD.estado='pendente' AND NEW.estado='cancelado'
    AND NEW.versao=OLD.versao+1
    AND (to_jsonb(NEW)-ARRAY['estado','versao','updated_at'])=(to_jsonb(OLD)-ARRAY['estado','versao','updated_at'])
    AND EXISTS(SELECT 1 FROM public.mimo_leads l WHERE l.empresa_id=NEW.empresa_id AND l.id=NEW.lead_id
      AND l.etapa='perdido' AND l.motivo_perda_codigo='falta_interesse')
 THEN RETURN NEW; END IF;
 IF NOT isfinite(NEW.prazo)$new$);

  worker := replace(worker,reserva,$new$'encerramentoRevenda',true,'resumo',c.resumo,'materiais',$new$);
  EXECUTE replace(worker,envio,$new$
  IF _p->'resultado'->>'motivo'='falta_interesse' THEN
   IF c.empresa_id IS DISTINCT FROM f.empresa_id OR f.solicitado_por IS NOT NULL
    OR f.motivo IN ('followup_2h','retomada_historica') OR auth.uid() IS NOT NULL
    OR _p->'resultado'->>'estado' IS DISTINCT FROM 'pausada'
    OR _p->'resultado'->>'resposta' IS DISTINCT FROM 'Tudo bem, agradeço pelo retorno!'
    OR _p->'resultado'->'encaminhar' IS DISTINCT FROM 'false'::jsonb
    OR _p->'resultado'->>'materialId' IS NOT NULL THEN RETURN 'false'; END IF;
   IF NOT c.piloto THEN
    -- The worker already locked and validated the active company, reservation, conversation and lead.
    UPDATE public.mimo_leads SET etapa='perdido',qualificacao='nao_qualificado',motivo_perda_codigo='falta_interesse'
     WHERE empresa_id=c.empresa_id AND id=c.lead_id AND etapa IN ('novo','contato_realizado') AND qualificacao='pendente';
    IF NOT FOUND THEN RETURN 'false'; END IF;
    WITH anteriores AS MATERIALIZED (
     SELECT id,to_jsonb(x) AS anterior FROM public.mimo_lead_followups x
     WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND estado='pendente' ORDER BY id FOR UPDATE
    ), cancelados AS (
     UPDATE public.mimo_lead_followups x SET estado='cancelado',versao=x.versao+1,updated_at=clock_timestamp()
     FROM anteriores a WHERE x.id=a.id AND x.empresa_id=c.empresa_id AND x.lead_id=c.lead_id
     RETURNING x.*,a.anterior,to_jsonb(x) AS atual
    )
    INSERT INTO public.mimo_lead_followup_historico
     (empresa_id,follow_id,lead_id,ator_id,acao,operacao_id,requisicao,anterior,atual)
    SELECT empresa_id,id,lead_id,responsavel_id,'cancelar_ia',gen_random_uuid(),
     jsonb_build_object('origem','ia','motivo','falta_interesse','fila',f.id),anterior,atual FROM cancelados;
   END IF;
   UPDATE public.mimo_agente_conversas SET estado='pausada',motivo='falta_interesse',followup_bloqueado=true,updated_at=clock_timestamp()
    WHERE id=c.id AND empresa_id=c.empresa_id;
   UPDATE public.mimo_agente_fila SET estado='cancelada',motivo='falta_interesse',updated_at=clock_timestamp()
    WHERE conversa_id=c.id AND empresa_id=c.empresa_id AND id<>f.id AND estado IN ('pendente','reservada')
     AND motivo IN ('followup_2h','retomada_historica');
   INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados)
    VALUES(c.empresa_id,c.id,'encerrar_revenda',jsonb_build_object('fila',f.id,'motivo','falta_interesse'));
  ELSIF coalesce(length(_p->'resultado'->>'resposta'),0) NOT BETWEEN 1 AND 800 OR coalesce(_p->'resultado'->>'estado','') NOT IN ('agente','humano','bloqueada') THEN
   RAISE EXCEPTION 'Resposta inválida';
  END IF;$new$);
END $patch$;