DROP POLICY IF EXISTS "Dono can update all profiles" ON public.profiles;

CREATE POLICY "Dono can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (private.is_dono(auth.uid()))
WITH CHECK (
  private.is_dono(auth.uid())
  AND plano IN ('free','pro')
);