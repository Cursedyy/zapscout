-- Operational setup: prepares an INACTIVE pg_cron job. Does not enable the agent.
-- Reuses the existing server-only transport without reading or printing its credential.
DO $mimo_agente_schedule$
DECLARE source_command text; target_command text; target_job bigint;
 old_path constant text := '/api/public/hooks/process-mimo-recuperacao';
 new_path constant text := '/api/public/hooks/process-mimo-agente';
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='mimo-agente-whatsapp') THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='mimo-agente-whatsapp' AND schedule='1 second' AND command LIKE '%mimo_agente_tick%' AND command LIKE '%'||new_path||'%') THEN
   RAISE EXCEPTION 'Existing agent schedule requires review';
  END IF;
  RETURN;
 END IF;
 SELECT command INTO STRICT source_command FROM cron.job WHERE jobname='mimo-recuperacao-whatsapp' AND active;
 IF source_command NOT LIKE '%net.http_post%' OR source_command NOT LIKE '%x-cron-secret%'
 OR length(source_command)-length(replace(source_command,old_path,''))<>length(old_path) THEN
  RAISE EXCEPTION 'Existing server transport requires review';
 END IF;
 target_command := format($tick$DO $mimo_agente_tick$ BEGIN
 IF EXISTS (
  SELECT 1 FROM public.mimo_agente_fila f JOIN public.mimo_agente_config cfg ON cfg.empresa_id=f.empresa_id
  WHERE (f.estado IN ('reservada','enviando') AND f.reservada_em<clock_timestamp()-interval '3 minutes')
   OR (cfg.modo<>'desativado' AND f.estado='pendente' AND f.solicitado_por IS NULL AND f.executar_em<=clock_timestamp())
 ) THEN EXECUTE %L; END IF;
 END $mimo_agente_tick$;$tick$,replace(source_command,old_path,new_path));
 target_job := cron.schedule('mimo-agente-whatsapp','1 second',target_command);
 PERFORM cron.alter_job(target_job, active:=false);
END $mimo_agente_schedule$;
