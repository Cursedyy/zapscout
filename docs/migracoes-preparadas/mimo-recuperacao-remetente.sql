-- Additive lookup for the service-side recovery worker and management panel.
-- Source backup 2026-11-17 verified before applying; no data or activation changes.
BEGIN;
CREATE FUNCTION public.mimo_recuperacao_vinculo_ia(_empresa uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT a.vinculo_id FROM public.mimo_agente_config a
  JOIN public.empresas e ON e.id=a.empresa_id
  WHERE a.empresa_id=_empresa AND e.slug='mimo' AND e.ativa
$$;
REVOKE ALL ON FUNCTION public.mimo_recuperacao_vinculo_ia(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_recuperacao_vinculo_ia(uuid) TO service_role;
COMMIT;
