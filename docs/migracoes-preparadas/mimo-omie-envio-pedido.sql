-- Aplicar pelo migrador oficial após verificar o backup.
CREATE TABLE public.mimo_omie_envios (
  pedido_id uuid PRIMARY KEY REFERENCES public.mimo_tira_pedidos(id),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  versao integer NOT NULL CHECK (versao > 0),
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  chave_app text NOT NULL CHECK (chave_app ~ '^[a-f0-9]{64}$'),
  hash_pedido text NOT NULL CHECK (hash_pedido ~ '^[a-f0-9]{64}$'),
  iniciado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  codigo_omie bigint CHECK (codigo_omie BETWEEN 1 AND 9007199254740991),
  numero_omie text CHECK (length(numero_omie) BETWEEN 1 AND 15),
  assinatura_comercial text CHECK (assinatura_comercial ~ '^[a-f0-9]{64}$'),
  confirmado_em timestamptz,
  CHECK ((codigo_omie IS NULL) = (numero_omie IS NULL)
    AND (codigo_omie IS NULL) = (confirmado_em IS NULL)
    AND (codigo_omie IS NULL) = (assinatura_comercial IS NULL)),
  UNIQUE (chave_app, codigo_omie)
);
ALTER TABLE public.mimo_omie_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_omie_envios FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mimo_omie_registrar_envio(
  _empresa uuid, _ator uuid, _pedido uuid, _versao integer, _app text, _hash_pedido text,
  _codigo_omie bigint DEFAULT NULL, _numero_omie text DEFAULT NULL, _assinatura text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  pedido public.mimo_tira_pedidos;
  envio public.mimo_omie_envios;
  reservado boolean := false;
BEGIN
  SELECT * INTO pedido FROM public.mimo_tira_pedidos
  WHERE id = _pedido AND empresa_id = _empresa FOR UPDATE;
  IF pedido.id IS NULL THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.mimo_tira_ator(_empresa, _ator, pedido.lead_id, true), '') NOT IN
    ('administrador', 'gestor', 'administrativo') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO envio FROM public.mimo_omie_envios WHERE pedido_id = _pedido;
  IF envio.pedido_id IS NULL THEN
    IF _codigo_omie IS NOT NULL OR pedido.versao IS DISTINCT FROM _versao
      OR pedido.status <> 'confirmado'
      OR (pedido.documento->'pagamento'->>'forma' = 'pix' AND pedido.pix IS NULL) THEN
      RAISE EXCEPTION 'Pedido alterado ou indisponivel.' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.mimo_omie_envios (pedido_id, empresa_id, versao, ator_id, chave_app, hash_pedido)
    VALUES (_pedido, _empresa, _versao, _ator, _app, _hash_pedido)
    RETURNING * INTO envio;
    reservado := true;
  ELSIF envio.versao IS DISTINCT FROM _versao OR envio.chave_app IS DISTINCT FROM _app
    OR envio.hash_pedido IS DISTINCT FROM _hash_pedido THEN
    RAISE EXCEPTION 'Confira o envio anterior no Omie.' USING ERRCODE = '40001';
  ELSIF _codigo_omie IS NOT NULL THEN
    IF envio.codigo_omie IS NULL THEN
      UPDATE public.mimo_omie_envios
      SET codigo_omie = _codigo_omie, numero_omie = _numero_omie,
        assinatura_comercial = _assinatura, confirmado_em = clock_timestamp()
      WHERE pedido_id = _pedido RETURNING * INTO envio;
    ELSIF envio.codigo_omie IS DISTINCT FROM _codigo_omie OR envio.numero_omie IS DISTINCT FROM _numero_omie
      OR envio.assinatura_comercial IS DISTINCT FROM _assinatura THEN
      RAISE EXCEPTION 'Identidade do pedido no Omie divergente.' USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN jsonb_build_object('reservado', reservado, 'codigo', envio.codigo_omie, 'numero', envio.numero_omie);
END;
$$;
REVOKE ALL ON FUNCTION public.mimo_omie_registrar_envio(uuid, uuid, uuid, integer, text, text, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_omie_registrar_envio(uuid, uuid, uuid, integer, text, text, bigint, text, text)
  TO service_role;
