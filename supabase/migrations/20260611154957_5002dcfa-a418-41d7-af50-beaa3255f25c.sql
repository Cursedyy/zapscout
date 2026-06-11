CREATE TABLE public.rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Sem policies: apenas service_role (que bypassa RLS) ou a função SECURITY DEFINER acessam.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _max int,
  _window_secs int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits (key, count, window_start)
  VALUES (_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN public.rate_limits.window_start < v_now - (_window_secs || ' seconds')::interval
          THEN 1
        ELSE public.rate_limits.count + 1
      END,
      window_start = CASE
        WHEN public.rate_limits.window_start < v_now - (_window_secs || ' seconds')::interval
          THEN v_now
        ELSE public.rate_limits.window_start
      END
  RETURNING count, window_start INTO v_count, v_window_start;

  RETURN v_count <= _max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

-- Limpa entradas antigas (janela > 1 dia) — chamada eventual via cron
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits
  WHERE window_start < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;