CREATE TABLE public.mimo_agente_telefones_excluidos (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  telefone text NOT NULL CHECK (telefone ~ '^[0-9]{12,15}$'),
  cadastrado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (empresa_id, telefone)
);
ALTER TABLE public.mimo_agente_telefones_excluidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_agente_telefones_excluidos FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mimo_agente_chave_telefone(_numero text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT regexp_replace(public.mimo_normalizar_telefone(_numero), '^(55[0-9]{2})9([6-9][0-9]{7})$', '\1\2')
$$;
REVOKE ALL ON FUNCTION public.mimo_agente_chave_telefone(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mimo_agente_telefone_excluido(_empresa uuid, _numero text)
RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mimo_agente_telefones_excluidos x
    WHERE x.empresa_id=_empresa AND x.telefone=public.mimo_agente_chave_telefone(_numero)
  )
$$;
REVOKE ALL ON FUNCTION public.mimo_agente_telefone_excluido(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

DO $mimo_exclusoes$
DECLARE
  interno text;
  worker text;
  trecho_interno constant text := 'SELECT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos';
  trecho_worker constant text := 'AND c.estado=''agente'' AND c.sequencia=f.sequencia';
BEGIN
  SELECT pg_get_functiondef('public.mimo_comercial_telefone_interno(uuid,text)'::regprocedure) INTO interno;
  SELECT pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure) INTO worker;
  IF (length(interno)-length(replace(interno,trecho_interno,''))) <> length(trecho_interno)
     OR (length(worker)-length(replace(worker,trecho_worker,''))) <> length(trecho_worker) THEN
    RAISE EXCEPTION 'Funções do atendimento incompatíveis com a exclusão de telefones';
  END IF;
  EXECUTE replace(interno, trecho_interno,
    'SELECT public.mimo_agente_telefone_excluido(_empresa,_numero) OR EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos');
  EXECUTE replace(worker, trecho_worker, trecho_worker ||
    ' AND NOT public.mimo_agente_telefone_excluido(c.empresa_id,c.telefone)');
END $mimo_exclusoes$;
