-- Validar o backup e aplicar pelo migrador oficial antes de publicar a fila.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mimo_leads_em_espera(_limite integer DEFAULT 20)
RETURNS TABLE(id uuid, empresa_id uuid, nome_empresa text, nome_contato text, telefone text, perfil text, origem text, entrada_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.id, l.empresa_id, l.nome_empresa, l.nome_contato, l.telefone, l.perfil, l.origem, l.entrada_em
  FROM public.mimo_leads l
  JOIN public.empresas e ON e.id = l.empresa_id AND e.slug = 'mimo' AND e.ativa
  WHERE l.responsavel_id IS NULL
    AND l.etapa <> 'perdido'
    AND public.tem_papel_empresa(e.id, auth.uid(), ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
  ORDER BY l.entrada_em, l.id
  LIMIT greatest(1, least(coalesce(_limite, 20), 50));
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
  WHERE l.id = _lead AND l.etapa <> 'perdido'
    AND public.tem_papel_empresa(e.id, _ator, ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
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

REVOKE ALL ON FUNCTION public.mimo_leads_em_espera(integer), public.mimo_assumir_lead(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mimo_leads_em_espera(integer), public.mimo_assumir_lead(uuid)
  TO authenticated;

-- Preservar o validador do banco e acrescentar somente a exceção de assumir o próprio atendimento.
DO $migration$
DECLARE
  _definicao text := pg_catalog.pg_get_functiondef('public.mimo_lead_validar()'::regprocedure);
  _antes text := 'NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN RAISE EXCEPTION ''Não é permitido reatribuir este lead'';';
  _depois text := 'NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id'
    || ' AND NOT (OLD.responsavel_id IS NULL AND NEW.responsavel_id = auth.uid()'
    || ' AND OLD.etapa <> ''perdido'' AND NEW.etapa <> ''perdido'')'
    || ' THEN RAISE EXCEPTION ''Não é permitido reatribuir este lead'';';
BEGIN
  IF strpos(_definicao, _depois) > 0 THEN
    RETURN;
  END IF;
  IF strpos(_definicao, _antes) = 0 OR
     length(_definicao) - length(replace(_definicao, _antes, '')) <> length(_antes) THEN
    RAISE EXCEPTION 'A regra de reatribuição em mimo_lead_validar mudou. Revise antes de aplicar a fila.';
  END IF;
  EXECUTE replace(_definicao, _antes, _depois);
END;
$migration$;

COMMIT;
