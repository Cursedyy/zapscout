
REVOKE INSERT, UPDATE, DELETE ON public.campanha_dispatch_logs FROM authenticated;

CREATE POLICY "campanha_dispatch_logs_deny_insert_authenticated"
  ON public.campanha_dispatch_logs FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "campanha_dispatch_logs_deny_update_authenticated"
  ON public.campanha_dispatch_logs FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "campanha_dispatch_logs_deny_delete_authenticated"
  ON public.campanha_dispatch_logs FOR DELETE TO authenticated
  USING (false);
