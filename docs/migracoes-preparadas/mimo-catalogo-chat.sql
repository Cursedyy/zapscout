BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mimo_catalogo_chat(_empresa uuid, _ator uuid, _lead uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.path
  FROM public.empresas e
  JOIN public.mimo_leads l ON l.empresa_id = e.id AND l.id = _lead
  JOIN public.mimo_agente_config c ON c.empresa_id = e.id
  JOIN public.mimo_agente_versoes v ON v.empresa_id = c.empresa_id AND v.versao = c.publicada
  JOIN public.mimo_agente_materiais m ON m.empresa_id = e.id AND v.config->'materiais' ? m.id::text
  WHERE e.id = _empresa AND e.slug = 'mimo' AND e.ativa
    AND public.tem_papel_empresa(e.id, _ator, ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
    AND m.ativo AND m.tipo = 'catalogo' AND m.mime = 'application/pdf'
    AND m.path = e.id::text || '/' || m.id::text || '.pdf'
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mimo_catalogo_chat(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_catalogo_chat(uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
