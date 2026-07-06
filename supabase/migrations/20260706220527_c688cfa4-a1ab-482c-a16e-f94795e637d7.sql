DROP POLICY IF EXISTS "campanha_cron_runs_select" ON public.campanha_cron_runs;
DROP POLICY IF EXISTS "campanha_cron_runs read" ON public.campanha_cron_runs;
DROP POLICY IF EXISTS "campanha_cron_runs_read" ON public.campanha_cron_runs;
DROP POLICY IF EXISTS "Authenticated can read cron runs" ON public.campanha_cron_runs;

CREATE POLICY "cron_runs_dono_select" ON public.campanha_cron_runs
FOR SELECT TO authenticated
USING (public.is_dono(auth.uid()));