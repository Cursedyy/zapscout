CREATE TABLE public.mimo_omie_faturamento_teste (
  pedido_id uuid PRIMARY KEY REFERENCES public.mimo_tira_pedidos(id),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  versao integer NOT NULL CHECK (versao > 0),
  chave_app text NOT NULL CHECK (chave_app ~ '^[a-f0-9]{64}$'),
  hash_pedido text NOT NULL CHECK (hash_pedido ~ '^[a-f0-9]{64}$'),
  codigo_integracao text NOT NULL CHECK (codigo_integracao ~ '^MIMO-[0-9]{1,15}$'),
  estado text NOT NULL CHECK (estado IN ('criando', 'criado', 'faturando', 'solicitado')),
  codigo_omie bigint CHECK (codigo_omie BETWEEN 1 AND 9007199254740991),
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((estado = 'criando') = (codigo_omie IS NULL)),
  UNIQUE (chave_app, codigo_integracao),
  UNIQUE (chave_app, codigo_omie)
);
ALTER TABLE public.mimo_omie_faturamento_teste ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_omie_faturamento_teste FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.mimo_omie_registrar_faturamento_teste(
  _empresa uuid, _ator uuid, _pedido uuid, _versao integer, _app text, _hash_pedido text,
  _acao text, _codigo_omie bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  pedido public.mimo_tira_pedidos;
  tentativa public.mimo_omie_faturamento_teste;
  mudou boolean := false;
BEGIN
  SELECT * INTO pedido FROM public.mimo_tira_pedidos
    WHERE id = _pedido AND empresa_id = _empresa FOR UPDATE;
  IF pedido.id IS NULL OR coalesce(public.mimo_tira_ator(_empresa, _ator, pedido.lead_id, true), '')
    NOT IN ('administrador', 'gestor') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO tentativa FROM public.mimo_omie_faturamento_teste WHERE pedido_id = _pedido;
  IF tentativa.pedido_id IS NOT NULL AND (tentativa.versao IS DISTINCT FROM _versao OR tentativa.chave_app IS DISTINCT FROM _app
    OR tentativa.hash_pedido IS DISTINCT FROM _hash_pedido) THEN
    RAISE EXCEPTION 'Confira a tentativa anterior no Omie antes de prosseguir.' USING ERRCODE = '40001';
  END IF;

  IF _acao IN ('reservar_criacao', 'reservar_faturamento') AND
    (pedido.versao IS DISTINCT FROM _versao OR pedido.status <> 'confirmado'
      OR (pedido.documento->'pagamento'->>'forma' = 'pix' AND pedido.pix IS NULL)) THEN
    RAISE EXCEPTION 'Pedido alterado ou indisponível para faturamento.' USING ERRCODE = '40001';
  END IF;

  CASE _acao
    WHEN 'reservar_criacao' THEN
      IF tentativa.pedido_id IS NULL THEN
        INSERT INTO public.mimo_omie_faturamento_teste
          (pedido_id, empresa_id, versao, chave_app, hash_pedido, codigo_integracao, estado, ator_id)
        VALUES (_pedido, _empresa, _versao, _app, _hash_pedido, 'MIMO-' || pedido.numero, 'criando', _ator)
        RETURNING * INTO tentativa;
        mudou := true;
      END IF;
    WHEN 'confirmar_criacao' THEN
      IF tentativa.estado = 'criando' THEN
        UPDATE public.mimo_omie_faturamento_teste SET estado = 'criado', codigo_omie = _codigo_omie,
          ator_id = _ator, atualizado_em = clock_timestamp() WHERE pedido_id = _pedido RETURNING * INTO tentativa;
      END IF;
    WHEN 'reservar_faturamento' THEN
      IF tentativa.estado = 'criado' THEN
        UPDATE public.mimo_omie_faturamento_teste SET estado = 'faturando',
          ator_id = _ator, atualizado_em = clock_timestamp() WHERE pedido_id = _pedido RETURNING * INTO tentativa;
        mudou := true;
      END IF;
    WHEN 'confirmar_solicitacao' THEN
      IF tentativa.estado = 'faturando' AND tentativa.codigo_omie = _codigo_omie THEN
        UPDATE public.mimo_omie_faturamento_teste SET estado = 'solicitado',
          ator_id = _ator, atualizado_em = clock_timestamp() WHERE pedido_id = _pedido RETURNING * INTO tentativa;
      END IF;
    ELSE RAISE EXCEPTION 'Ação do Omie inválida.';
  END CASE;

  RETURN jsonb_build_object('reservada', mudou, 'estado', tentativa.estado,
    'codigoIntegracao', tentativa.codigo_integracao, 'codigoOmie', tentativa.codigo_omie);
END $$;
REVOKE ALL ON FUNCTION public.mimo_omie_registrar_faturamento_teste(uuid, uuid, uuid, integer, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_omie_registrar_faturamento_teste(uuid, uuid, uuid, integer, text, text, text, bigint)
  TO service_role;
