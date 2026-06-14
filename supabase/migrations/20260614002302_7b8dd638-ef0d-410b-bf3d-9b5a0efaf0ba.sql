-- 1) profiles: impedir que UPDATE conceda plano 'dono' (mesmo via política do dono).
DROP POLICY IF EXISTS "Dono can update all profiles" ON public.profiles;

CREATE POLICY "Dono can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (private.is_dono(auth.uid()))
  WITH CHECK (
    private.is_dono(auth.uid())
    AND plano <> 'dono'
  );

-- Reforço: o próprio usuário também nunca pode promover-se a 'dono' via UPDATE.
-- (A política existente já trava `plano` ao valor persistido; este check é defesa em profundidade.)
DROP POLICY IF EXISTS "Users can update own profile without changing plan" ON public.profiles;

CREATE POLICY "Users can update own profile without changing plan"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND plano = private.profile_plan(auth.uid())
    AND plano <> 'dono'
  );

-- 2) security_logs: trocar política PERMISSIVE false (inócua) por RESTRICTIVE real
-- que bloqueia qualquer não-dono em qualquer comando.
DROP POLICY IF EXISTS "Clients cannot access security logs" ON public.security_logs;

CREATE POLICY "Only dono can access security logs"
  ON public.security_logs
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (private.is_dono(auth.uid()))
  WITH CHECK (private.is_dono(auth.uid()));