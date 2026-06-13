-- Corrige is_dono para não depender de RLS do chamador e não causar recursão em policies.
CREATE OR REPLACE FUNCTION public.is_dono(_user_id uuid)
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

REVOKE ALL ON FUNCTION public.is_dono(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dono(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dono(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_aquecimento_chips_max() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_aquecimento_chips_max() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_aquecimento_chips_max() TO service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- Reduz grants anônimos em tabelas com dados de usuários; authenticated mantém CRUD via RLS.
REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.campanhas FROM anon;
REVOKE ALL ON public.mensagens_enviadas FROM anon;
REVOKE ALL ON public.sequencias FROM anon;
REVOKE ALL ON public.followups FROM anon;
REVOKE ALL ON public.templates FROM anon;
REVOKE ALL ON public.feedbacks FROM anon;
REVOKE ALL ON public.notificacoes FROM anon;
REVOKE ALL ON public.aquecimento_chips FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.security_logs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensagens_enviadas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequencias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedbacks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aquecimento_chips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.security_logs TO authenticated;

GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.campanhas TO service_role;
GRANT ALL ON public.mensagens_enviadas TO service_role;
GRANT ALL ON public.sequencias TO service_role;
GRANT ALL ON public.followups TO service_role;
GRANT ALL ON public.templates TO service_role;
GRANT ALL ON public.feedbacks TO service_role;
GRANT ALL ON public.notificacoes TO service_role;
GRANT ALL ON public.aquecimento_chips TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.security_logs TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_enviadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aquecimento_chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Recria policies básicas como authenticated + user_id/auth.uid explícito.
DROP POLICY IF EXISTS "own leads all" ON public.leads;
DROP POLICY IF EXISTS "Users can manage own leads" ON public.leads;
CREATE POLICY "Users can manage own leads"
ON public.leads
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own campanhas all" ON public.campanhas;
DROP POLICY IF EXISTS "Users can manage own campanhas" ON public.campanhas;
CREATE POLICY "Users can manage own campanhas"
ON public.campanhas
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own msgs all" ON public.mensagens_enviadas;
DROP POLICY IF EXISTS "Users can manage own mensagens" ON public.mensagens_enviadas;
CREATE POLICY "Users can manage own mensagens"
ON public.mensagens_enviadas
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own sequencias all" ON public.sequencias;
DROP POLICY IF EXISTS "Users can manage own sequencias" ON public.sequencias;
CREATE POLICY "Users can manage own sequencias"
ON public.sequencias
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own templates all" ON public.templates;
DROP POLICY IF EXISTS "Users can manage own templates" ON public.templates;
CREATE POLICY "Users can manage own templates"
ON public.templates
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own notifs" ON public.notificacoes;
DROP POLICY IF EXISTS "Users can manage own notifications" ON public.notificacoes;
CREATE POLICY "Users can manage own notifications"
ON public.notificacoes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own chips" ON public.aquecimento_chips;
DROP POLICY IF EXISTS "Users can manage own aquecimento chips" ON public.aquecimento_chips;
CREATE POLICY "Users can manage own aquecimento chips"
ON public.aquecimento_chips
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Followups pertencem ao usuário por meio da campanha.
DROP POLICY IF EXISTS "own followups all" ON public.followups;
DROP POLICY IF EXISTS "Users can manage own followups" ON public.followups;
CREATE POLICY "Users can manage own followups"
ON public.followups
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.campanhas c
    WHERE c.id = followups.campanha_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.campanhas c
    WHERE c.id = followups.campanha_id
      AND c.user_id = auth.uid()
  )
);

-- Feedback: usuário comum cria/lê o próprio; dono lê todos.
DROP POLICY IF EXISTS "Users can insert their own feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Users can view their own feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "dono sees all feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Users can create own feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Users can read own feedbacks" ON public.feedbacks;
DROP POLICY IF EXISTS "Dono can read all feedbacks" ON public.feedbacks;
CREATE POLICY "Users can create own feedbacks"
ON public.feedbacks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own feedbacks"
ON public.feedbacks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Dono can read all feedbacks"
ON public.feedbacks
FOR SELECT
TO authenticated
USING (public.is_dono(auth.uid()));

-- Profiles: usuário comum lê/atualiza o próprio perfil sem tocar plano; dono pode atualizar todos.
DROP POLICY IF EXISTS "own profile select" ON public.profiles;
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
DROP POLICY IF EXISTS "dono can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can create own free profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile without changing plan" ON public.profiles;
DROP POLICY IF EXISTS "Dono can update all profiles" ON public.profiles;
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);
CREATE POLICY "Users can create own free profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id AND plano = 'free');
CREATE POLICY "Users can update own profile without changing plan"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND plano = (SELECT p.plano FROM public.profiles p WHERE p.id = auth.uid())
);
CREATE POLICY "Dono can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_dono(auth.uid()))
WITH CHECK (public.is_dono(auth.uid()));

-- Security logs não são dados de operação básica; usuários comuns não leem/escrevem no client.
DROP POLICY IF EXISTS "deny all client access to security_logs" ON public.security_logs;
DROP POLICY IF EXISTS "dono can view security logs" ON public.security_logs;
DROP POLICY IF EXISTS "Clients cannot access security logs" ON public.security_logs;
DROP POLICY IF EXISTS "Dono can view security logs" ON public.security_logs;
CREATE POLICY "Clients cannot access security logs"
ON public.security_logs
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
CREATE POLICY "Dono can view security logs"
ON public.security_logs
FOR SELECT
TO authenticated
USING (public.is_dono(auth.uid()));