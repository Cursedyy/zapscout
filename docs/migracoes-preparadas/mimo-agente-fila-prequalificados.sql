-- A fila usa o encaminhamento de pré-qualificação efetivamente enviado pela IA.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mimo_lead_prequalificado_ia(_empresa uuid, _lead uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mimo_agente_conversas c
    JOIN public.mimo_agente_fila f ON f.conversa_id = c.id AND f.empresa_id = c.empresa_id
    WHERE c.empresa_id = _empresa AND c.lead_id = _lead
      AND NOT c.piloto AND c.estado = 'humano' AND c.revisao_humana <> 'rejeitada'
      AND f.estado = 'enviada' AND f.message_id IS NOT NULL AND f.solicitado_por IS NULL
      AND f.resultado->>'estado' = 'humano'
      AND f.resultado->>'motivo' = 'pre_qualificacao_pendente_revisao'
      AND f.resultado->>'resumo' = c.resumo
  );
$$;

REVOKE ALL ON FUNCTION public.mimo_lead_prequalificado_ia(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mimo_leads_em_espera(_limite integer DEFAULT 20)
RETURNS TABLE(id uuid, empresa_id uuid, nome_empresa text, nome_contato text, telefone text, perfil text, origem text, entrada_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.id, l.empresa_id, l.nome_empresa, l.nome_contato, l.telefone, l.perfil, l.origem, l.entrada_em
  FROM public.mimo_leads l
  JOIN public.empresas e ON e.id = l.empresa_id AND e.slug = 'mimo' AND e.ativa
  WHERE l.responsavel_id IS NULL AND l.qualificacao = 'pendente' AND l.etapa <> 'perdido'
    AND public.tem_papel_empresa(e.id, auth.uid(), ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
    AND public.mimo_lead_prequalificado_ia(e.id, l.id)
  ORDER BY l.entrada_em, l.id
  LIMIT greatest(1, least(coalesce(_limite, 20), 50));
$$;

CREATE OR REPLACE FUNCTION public.mimo_meus_leads_prequalificados()
RETURNS TABLE(id uuid, nome_empresa text, nome_contato text, telefone text, entrada_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.id, l.nome_empresa, l.nome_contato, l.telefone, l.entrada_em
  FROM public.mimo_leads l
  JOIN public.empresas e ON e.id = l.empresa_id AND e.slug = 'mimo' AND e.ativa
  WHERE l.responsavel_id = auth.uid() AND l.qualificacao = 'pendente' AND l.etapa <> 'perdido'
    AND public.tem_papel_empresa(e.id, auth.uid(), ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
    AND public.mimo_lead_prequalificado_ia(e.id, l.id)
  ORDER BY l.entrada_em, l.id
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.mimo_assumir_lead(_lead uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _ator uuid := auth.uid();
  _responsavel uuid;
BEGIN
  IF _ator IS NULL THEN
    RETURN false;
  END IF;

  SELECT l.responsavel_id INTO _responsavel
  FROM public.mimo_leads l
  JOIN public.empresas e ON e.id = l.empresa_id AND e.slug = 'mimo' AND e.ativa
  WHERE l.id = _lead AND l.qualificacao = 'pendente' AND l.etapa <> 'perdido'
    AND public.tem_papel_empresa(e.id, _ator, ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
    AND public.mimo_lead_prequalificado_ia(e.id, l.id)
  FOR UPDATE OF l;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF _responsavel IS NOT NULL THEN
    RETURN _responsavel = _ator;
  END IF;

  UPDATE public.mimo_leads SET responsavel_id = _ator WHERE id = _lead;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.mimo_leads_em_espera(integer), public.mimo_assumir_lead(uuid), public.mimo_meus_leads_prequalificados()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mimo_leads_em_espera(integer), public.mimo_assumir_lead(uuid), public.mimo_meus_leads_prequalificados()
  TO authenticated;

COMMIT;
