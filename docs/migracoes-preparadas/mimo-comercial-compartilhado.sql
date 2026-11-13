-- PREPARED ONLY: apply after backup evidence and review, before revised follow-up SQL.
CREATE OR REPLACE FUNCTION public.pode_ver_mimo_lead(_lead_id uuid,_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.mimo_leads l JOIN public.empresas e ON e.id=l.empresa_id
 JOIN public.empresa_membros m ON m.empresa_id=e.id
 WHERE l.id=_lead_id AND e.slug='mimo' AND e.ativa AND m.user_id=_user_id AND m.ativo
 AND m.papel::text IN ('administrador','gestor','vendedor','administrativo'))
$$;
REVOKE ALL ON FUNCTION public.pode_ver_mimo_lead(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_mimo_lead(uuid,uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS mimo_leads_read ON public.mimo_leads;
CREATE POLICY mimo_leads_read ON public.mimo_leads FOR SELECT TO authenticated
USING(public.pode_ver_mimo_lead(id,auth.uid()));
DROP POLICY IF EXISTS mimo_leads_update ON public.mimo_leads;
CREATE POLICY mimo_leads_update ON public.mimo_leads FOR UPDATE TO authenticated
USING(public.pode_ver_mimo_lead(id,auth.uid()) AND public.empresa_papel_de(empresa_id,auth.uid())::text IN ('administrador','gestor','vendedor'))
WITH CHECK(public.pode_ver_mimo_lead(id,auth.uid()) AND public.empresa_papel_de(empresa_id,auth.uid())::text IN ('administrador','gestor','vendedor'));
-- Insert ownership, identity/priority guards and audited reassignment remain unchanged.
-- Existing history/event policies and safe order views call pode_ver_mimo_lead.
CREATE OR REPLACE FUNCTION public.mimo_tira_ator(_empresa uuid,_ator uuid,_lead uuid,_gestao boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.empresa_membros; l public.mimo_leads;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo FOR UPDATE;
 IF m.user_id IS NULL OR m.papel::text NOT IN ('administrador','gestor','vendedor','administrativo')
 OR (_gestao AND m.papel::text NOT IN ('administrador','gestor','administrativo'))
 THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
 IF _lead IS NOT NULL THEN
  SELECT * INTO l FROM public.mimo_leads WHERE id=_lead AND empresa_id=_empresa FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN m.papel::text;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_ator(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_ator(uuid,uuid,uuid,boolean) TO service_role;