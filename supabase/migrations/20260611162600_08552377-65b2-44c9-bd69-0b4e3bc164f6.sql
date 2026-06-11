-- 1) Prevent privilege escalation via profiles.plano (and related role fields)
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND plano IS NOT DISTINCT FROM (SELECT p.plano FROM public.profiles p WHERE p.id = auth.uid())
);

-- 2) Lock down security_logs to service_role only (defense in depth).
REVOKE ALL ON public.security_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.security_logs TO service_role;

-- Restrictive deny-all for client roles; admin reads happen via service_role / server fns.
DROP POLICY IF EXISTS "deny all client access to security_logs" ON public.security_logs;
CREATE POLICY "deny all client access to security_logs"
ON public.security_logs
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);