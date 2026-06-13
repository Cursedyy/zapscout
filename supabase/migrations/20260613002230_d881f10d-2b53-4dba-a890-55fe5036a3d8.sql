-- 1) Realtime: restringir SELECT em realtime.messages ao topic do próprio usuário.
-- Evita que qualquer authenticated escute notif:<outro_user_id>.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only subscribe to their own notif topic" ON realtime.messages;

CREATE POLICY "Users can only subscribe to their own notif topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'notif:' || auth.uid()::text
);

-- 2) Profiles: remover a SELECT policy do dono que expunha credenciais (wa_api_key,
-- wa_meta_token, uazapi_instance_token, token_acesso) de todos os usuários.
-- Operações administrativas devem usar service_role server-side.
DROP POLICY IF EXISTS "dono can view all profiles" ON public.profiles;
