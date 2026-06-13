CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.is_dono(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.plano = 'dono'
    FROM public.profiles p
    WHERE p.id = _user_id
    LIMIT 1
  ), false)
$$;

REVOKE ALL ON FUNCTION private.is_dono(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_dono(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_dono(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_dono(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.plano = 'dono'
    FROM public.profiles p
    WHERE p.id = _user_id
    LIMIT 1
  ), false)
$$;

REVOKE ALL ON FUNCTION public.is_dono(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dono(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dono(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_aquecimento_chips_max() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM authenticated;

DROP POLICY IF EXISTS "Dono can read all feedbacks" ON public.feedbacks;
CREATE POLICY "Dono can read all feedbacks"
ON public.feedbacks
FOR SELECT
TO authenticated
USING (private.is_dono(auth.uid()));

DROP POLICY IF EXISTS "Dono can update all profiles" ON public.profiles;
CREATE POLICY "Dono can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (private.is_dono(auth.uid()))
WITH CHECK (private.is_dono(auth.uid()));

DROP POLICY IF EXISTS "Dono can read all profiles" ON public.profiles;
CREATE POLICY "Dono can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (private.is_dono(auth.uid()));

DROP POLICY IF EXISTS "Dono can view security logs" ON public.security_logs;
CREATE POLICY "Dono can view security logs"
ON public.security_logs
FOR SELECT
TO authenticated
USING (private.is_dono(auth.uid()));