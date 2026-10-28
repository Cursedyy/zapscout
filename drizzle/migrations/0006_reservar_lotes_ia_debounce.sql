CREATE OR REPLACE FUNCTION public.reservar_lotes_ia_debounce(
  _silencio_ms integer DEFAULT 5000,
  _teto_ms integer DEFAULT 20000,
  _lock_ms integer DEFAULT 180000
)
RETURNS TABLE (id uuid, user_id uuid, lead_id uuid, uazapi_instancia_id uuid, debounce_buffer jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH alvo AS (
    SELECT c.id
    FROM public.ia_conversas c
    WHERE c.debounce_primeira_em IS NOT NULL
      AND (c.debounce_ultima_atividade_em <= now() - make_interval(secs => _silencio_ms / 1000.0)
           OR c.debounce_primeira_em <= now() - make_interval(secs => _teto_ms / 1000.0))
      AND (c.debounce_processando_desde IS NULL
           OR c.debounce_processando_desde <= now() - make_interval(secs => _lock_ms / 1000.0))
    ORDER BY c.debounce_primeira_em
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ia_conversas c
     SET debounce_processando_desde = now()
    FROM alvo
   WHERE c.id = alvo.id
  RETURNING c.id, c.user_id, c.lead_id, c.uazapi_instancia_id, c.debounce_buffer;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_lotes_ia_debounce(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_lotes_ia_debounce(integer, integer, integer) TO service_role;