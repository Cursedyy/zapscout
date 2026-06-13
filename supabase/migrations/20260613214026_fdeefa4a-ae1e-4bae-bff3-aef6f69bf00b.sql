CREATE OR REPLACE FUNCTION private.profile_plan(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.plano
  FROM public.profiles p
  WHERE p.id = _user_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.profile_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.profile_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.profile_plan(uuid) TO service_role;

DROP POLICY IF EXISTS "Users can update own profile without changing plan" ON public.profiles;
CREATE POLICY "Users can update own profile without changing plan"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND plano = private.profile_plan(auth.uid())
);