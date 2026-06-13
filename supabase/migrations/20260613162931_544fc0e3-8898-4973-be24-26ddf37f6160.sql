DROP POLICY IF EXISTS "own profile insert" ON public.profiles;

CREATE POLICY "own profile insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND plano = 'free'
);