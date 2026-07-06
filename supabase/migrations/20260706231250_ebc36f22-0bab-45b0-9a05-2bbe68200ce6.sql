-- Defense-in-depth: campanha_cron_runs é escrita exclusivamente pela hook
-- do cron (roda com service_role e ignora RLS). Nem usuários autenticados
-- nem anônimos devem conseguir inserir/alterar/apagar linhas via Data API.

REVOKE INSERT, UPDATE, DELETE ON public.campanha_cron_runs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.campanha_cron_runs FROM anon;

-- Garante que service_role permanece com acesso total para a hook do cron.
GRANT ALL ON public.campanha_cron_runs TO service_role;

-- Políticas restritivas explícitas: mesmo que um GRANT vaze no futuro, o RLS
-- ainda bloqueia qualquer escrita vinda de authenticated/anon.
DROP POLICY IF EXISTS "cron_runs_no_insert" ON public.campanha_cron_runs;
DROP POLICY IF EXISTS "cron_runs_no_update" ON public.campanha_cron_runs;
DROP POLICY IF EXISTS "cron_runs_no_delete" ON public.campanha_cron_runs;

CREATE POLICY "cron_runs_no_insert" ON public.campanha_cron_runs
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "cron_runs_no_update" ON public.campanha_cron_runs
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "cron_runs_no_delete" ON public.campanha_cron_runs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);
