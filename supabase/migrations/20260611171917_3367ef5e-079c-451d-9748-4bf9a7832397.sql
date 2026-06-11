-- Fix 1: dono update policy needs WITH CHECK to prevent overwriting sensitive credentials of other users.
-- Restrict dono updates to non-credential fields by requiring credentials to remain unchanged when dono updates another user's row.
DROP POLICY IF EXISTS "dono can update all profiles" ON public.profiles;

CREATE POLICY "dono can update all profiles"
ON public.profiles
FOR UPDATE
USING (public.is_dono(auth.uid()))
WITH CHECK (
  public.is_dono(auth.uid())
  AND (
    auth.uid() = id
    OR (
      wa_api_key IS NOT DISTINCT FROM (SELECT p.wa_api_key FROM public.profiles p WHERE p.id = profiles.id)
      AND wa_meta_token IS NOT DISTINCT FROM (SELECT p.wa_meta_token FROM public.profiles p WHERE p.id = profiles.id)
      AND uazapi_instance_token IS NOT DISTINCT FROM (SELECT p.uazapi_instance_token FROM public.profiles p WHERE p.id = profiles.id)
      AND token_acesso IS NOT DISTINCT FROM (SELECT p.token_acesso FROM public.profiles p WHERE p.id = profiles.id)
    )
  )
);

-- Fix 2: sequencia_execucoes must verify the referenced sequencia belongs to the user.
DROP POLICY IF EXISTS "own execucoes all" ON public.sequencia_execucoes;

CREATE POLICY "own execucoes all"
ON public.sequencia_execucoes
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.sequencias s
    WHERE s.id = sequencia_id AND s.user_id = auth.uid()
  )
);