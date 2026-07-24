CREATE TABLE public.login_lockouts (
  email_hash text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.login_lockouts TO service_role;

ALTER TABLE public.login_lockouts ENABLE ROW LEVEL SECURITY;

-- Sem policies: acesso apenas via funções SECURITY DEFINER abaixo.

CREATE INDEX login_lockouts_last_failed_idx ON public.login_lockouts (last_failed_at);

-- Retorna locked_until se ainda ativo, senão NULL.
CREATE OR REPLACE FUNCTION public.check_login_lockout(_email_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_until timestamptz;
BEGIN
  SELECT locked_until INTO v_locked_until
  FROM public.login_lockouts
  WHERE email_hash = _email_hash;

  IF v_locked_until IS NULL OR v_locked_until <= now() THEN
    RETURN NULL;
  END IF;
  RETURN v_locked_until;
END;
$$;

-- Incrementa contador e define locked_until pela progressão.
-- Reseta contador se última falha foi há mais de 24h.
CREATE OR REPLACE FUNCTION public.register_login_failure(_email_hash text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_last timestamptz;
  v_lock_secs integer := 0;
  v_locked_until timestamptz := NULL;
BEGIN
  SELECT failed_count, last_failed_at INTO v_count, v_last
  FROM public.login_lockouts
  WHERE email_hash = _email_hash;

  IF v_count IS NULL OR v_last < now() - interval '24 hours' THEN
    v_count := 1;
  ELSE
    v_count := v_count + 1;
  END IF;

  v_lock_secs := CASE
    WHEN v_count >= 15 THEN 24 * 3600
    WHEN v_count >= 10 THEN 3600
    WHEN v_count >= 7  THEN 15 * 60
    WHEN v_count >= 5  THEN 5 * 60
    WHEN v_count >= 3  THEN 60
    ELSE 0
  END;

  IF v_lock_secs > 0 THEN
    v_locked_until := now() + (v_lock_secs || ' seconds')::interval;
  END IF;

  INSERT INTO public.login_lockouts (email_hash, failed_count, locked_until, last_failed_at)
  VALUES (_email_hash, v_count, v_locked_until, now())
  ON CONFLICT (email_hash) DO UPDATE
    SET failed_count = EXCLUDED.failed_count,
        locked_until = EXCLUDED.locked_until,
        last_failed_at = EXCLUDED.last_failed_at;

  RETURN v_locked_until;
END;
$$;

-- Limpa após login bem-sucedido.
CREATE OR REPLACE FUNCTION public.clear_login_lockout(_email_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_lockouts WHERE email_hash = _email_hash;
$$;
