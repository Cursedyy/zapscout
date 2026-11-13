-- Operational setup, reviewed separately from application schema migrations.
-- Creates an INACTIVE job and never prints or stores the existing cron credential.
DO $mimo_follow_schedule$
DECLARE source_command text; target_command text; target_job bigint;
 old_path constant text:='/api/public/hooks/process-mimo-recuperacao';
 new_path constant text:='/api/public/hooks/process-mimo-followups';
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='mimo-followups-internos') THEN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='mimo-followups-internos' AND schedule='* * * * *'
   AND command LIKE '%mimo_follow_tick%' AND command LIKE '%'||new_path||'%')
  THEN RAISE EXCEPTION 'Existing follow-up schedule requires review'; END IF;
  RETURN;
 END IF;
 SELECT command INTO STRICT source_command FROM cron.job WHERE jobname='mimo-recuperacao-whatsapp' AND active;
 IF source_command NOT LIKE '%net.http_post%' OR source_command NOT LIKE '%x-cron-secret%'
 OR length(source_command)-length(replace(source_command,old_path,''))<>length(old_path)
 THEN RAISE EXCEPTION 'Existing authenticated transport requires review'; END IF;
 target_command:=format($tick$DO $mimo_follow_tick$ BEGIN
 IF EXISTS(SELECT 1 FROM public.mimo_follow_aviso_fila q
 WHERE (q.estado='bloqueada' AND q.executar_em<=clock_timestamp() AND public.mimo_follow_aviso_elegivel(q.id))
 OR (q.estado IN ('reservada','enviando') AND q.reservada_em<clock_timestamp()-interval '5 minutes'))
 THEN EXECUTE %L; END IF;
 END $mimo_follow_tick$;$tick$,replace(source_command,old_path,new_path));
 target_job:=cron.schedule('mimo-followups-internos','* * * * *',target_command);
 PERFORM cron.alter_job(target_job,active:=false);
END $mimo_follow_schedule$;
