CREATE OR REPLACE FUNCTION public.pode_ver_mimo_lead(_lead_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mimo_leads l
    WHERE l.id = _lead_id
      AND public.is_membro_empresa(l.empresa_id, _user_id)
      AND (public.tem_papel_empresa(l.empresa_id, _user_id, ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel])
           OR l.responsavel_id = _user_id)
  )
$$;
REVOKE ALL ON FUNCTION public.pode_ver_mimo_lead(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_mimo_lead(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS mimo_leads_read ON public.mimo_leads;
CREATE POLICY mimo_leads_read ON public.mimo_leads FOR SELECT TO authenticated
USING (public.is_membro_empresa(empresa_id, auth.uid())
  AND (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel])
       OR responsavel_id = auth.uid()));

DROP POLICY IF EXISTS mimo_historico_read ON public.mimo_lead_historico;
CREATE POLICY mimo_historico_read ON public.mimo_lead_historico FOR SELECT TO authenticated
USING (public.is_membro_empresa(empresa_id, auth.uid())
  AND (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel])
       OR public.pode_ver_mimo_lead(lead_id, auth.uid())));

DROP POLICY IF EXISTS mimo_eventos_read ON public.mimo_whatsapp_eventos;
CREATE POLICY mimo_eventos_read ON public.mimo_whatsapp_eventos FOR SELECT TO authenticated
USING (public.is_membro_empresa(empresa_id, auth.uid())
  AND (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel])
       OR (lead_id IS NOT NULL AND public.pode_ver_mimo_lead(lead_id, auth.uid()))));

-- Indicadores agregados da equipe (sem registros individuais) para qualquer membro ativo.
CREATE OR REPLACE FUNCTION public.mimo_indicadores_equipe(_empresa_id uuid, _inicio timestamptz, _fim timestamptz)
RETURNS TABLE(leads_total bigint, pedidos_fechados bigint, faturamento numeric, perdidos bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_membro_empresa(_empresa_id, auth.uid()) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE l.etapa = 'pedido_fechado')::bigint,
         coalesce(sum(l.valor_pedido) FILTER (WHERE l.etapa = 'pedido_fechado'), 0)::numeric,
         count(*) FILTER (WHERE l.etapa = 'perdido')::bigint
  FROM public.mimo_leads l
  WHERE l.empresa_id = _empresa_id AND l.entrada_em >= _inicio AND l.entrada_em < _fim;
END $$;
REVOKE ALL ON FUNCTION public.mimo_indicadores_equipe(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_indicadores_equipe(uuid, timestamptz, timestamptz) TO authenticated, service_role;