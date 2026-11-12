-- Allow active sellers to operate the company representatives panel.
ALTER POLICY representantes_ler ON public.mimo_representantes TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing','vendedor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
ALTER POLICY representantes_avaliar ON public.mimo_representantes TO authenticated USING (
 excluido_em IS NULL AND public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing','vendedor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)) WITH CHECK (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing','vendedor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
ALTER POLICY representantes_historico_ler ON public.mimo_representantes_historico TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing','vendedor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));

CREATE OR REPLACE FUNCTION public.mimo_representante_excluir(p_id uuid,p_versao integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e uuid;
BEGIN
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL OR NOT public.tem_papel_empresa(e,auth.uid(),ARRAY['administrador','gestor','marketing','vendedor']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Access denied';END IF;
 UPDATE public.mimo_representantes SET excluido_em=clock_timestamp(),excluido_por=auth.uid() WHERE id=p_id AND empresa_id=e AND versao=p_versao AND excluido_em IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.mimo_representante_excluir(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_representante_excluir(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
