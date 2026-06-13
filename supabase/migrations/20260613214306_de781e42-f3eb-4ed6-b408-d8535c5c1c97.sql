REVOKE ALL ON public.sequencia_execucoes FROM anon;
REVOKE ALL ON public.ia_config FROM anon;
REVOKE ALL ON public.ia_conversas FROM anon;
REVOKE ALL ON public.ia_escalonamentos FROM anon;
REVOKE ALL ON public.ia_qas FROM anon;
REVOKE ALL ON public.regioes_prospectadas FROM anon;
REVOKE ALL ON public.whatsapp_conexoes FROM anon;
REVOKE ALL ON public.prospeccao_auto_config FROM anon;
REVOKE ALL ON public.suporte_tickets FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequencia_execucoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_conversas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_escalonamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_qas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regioes_prospectadas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conexoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_auto_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suporte_tickets TO authenticated;

GRANT ALL ON public.sequencia_execucoes TO service_role;
GRANT ALL ON public.ia_config TO service_role;
GRANT ALL ON public.ia_conversas TO service_role;
GRANT ALL ON public.ia_escalonamentos TO service_role;
GRANT ALL ON public.ia_qas TO service_role;
GRANT ALL ON public.regioes_prospectadas TO service_role;
GRANT ALL ON public.whatsapp_conexoes TO service_role;
GRANT ALL ON public.prospeccao_auto_config TO service_role;
GRANT ALL ON public.suporte_tickets TO service_role;

DROP POLICY IF EXISTS "own execucoes all" ON public.sequencia_execucoes;
DROP POLICY IF EXISTS "Users can manage own sequencia execucoes" ON public.sequencia_execucoes;
CREATE POLICY "Users can manage own sequencia execucoes"
ON public.sequencia_execucoes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.sequencias s
    WHERE s.id = sequencia_execucoes.sequencia_id
      AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "own ia_config all" ON public.ia_config;
DROP POLICY IF EXISTS "Users can manage own ia config" ON public.ia_config;
CREATE POLICY "Users can manage own ia config"
ON public.ia_config
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own ia_conversas all" ON public.ia_conversas;
DROP POLICY IF EXISTS "Users can manage own ia conversas" ON public.ia_conversas;
CREATE POLICY "Users can manage own ia conversas"
ON public.ia_conversas
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own ia_escal all" ON public.ia_escalonamentos;
DROP POLICY IF EXISTS "Users can manage own ia escalonamentos" ON public.ia_escalonamentos;
CREATE POLICY "Users can manage own ia escalonamentos"
ON public.ia_escalonamentos
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own ia_qas all" ON public.ia_qas;
DROP POLICY IF EXISTS "Users can manage own ia qas" ON public.ia_qas;
CREATE POLICY "Users can manage own ia qas"
ON public.ia_qas
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own regioes all" ON public.regioes_prospectadas;
DROP POLICY IF EXISTS "Users can manage own regioes" ON public.regioes_prospectadas;
CREATE POLICY "Users can manage own regioes"
ON public.regioes_prospectadas
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own whats all" ON public.whatsapp_conexoes;
DROP POLICY IF EXISTS "Users can manage own whatsapp conexoes" ON public.whatsapp_conexoes;
CREATE POLICY "Users can manage own whatsapp conexoes"
ON public.whatsapp_conexoes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);