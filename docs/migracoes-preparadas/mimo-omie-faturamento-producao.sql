-- Depende de mimo-omie-envio-pedido.sql. Aplicar pelo migrador oficial após verificar o backup.
ALTER TABLE public.mimo_omie_envios
  ADD COLUMN faturamento_reservado_em timestamptz,
  ADD COLUMN faturamento_ator uuid REFERENCES auth.users(id),
  ADD COLUMN nfe_chave text UNIQUE CHECK (nfe_chave ~ '^[0-9]{44}$'),
  ADD COLUMN nfe_numero text CHECK (nfe_numero ~ '^[0-9]{1,10}$'),
  ADD COLUMN nfe_data date,
  ADD CONSTRAINT mimo_omie_nfe_identidade CHECK (
    (faturamento_reservado_em IS NULL) = (faturamento_ator IS NULL)
    AND (nfe_chave IS NULL) = (nfe_numero IS NULL)
    AND (nfe_chave IS NULL) = (nfe_data IS NULL)
  );

CREATE FUNCTION public.mimo_omie_bloquear_edicao_fiscal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.mimo_omie_envios
    WHERE pedido_id = OLD.id AND empresa_id = OLD.empresa_id
      AND nfe_chave IS NULL
      AND (faturamento_reservado_em IS NOT NULL
        OR (codigo_omie IS NOT NULL AND NEW.status = 'faturado' AND OLD.status <> NEW.status))
  ) THEN
    RAISE EXCEPTION 'Pedido aguarda conciliacao do faturamento no Omie.' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mimo_omie_bloquear_edicao_fiscal() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER mimo_omie_bloquear_edicao_fiscal
  BEFORE UPDATE ON public.mimo_tira_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.mimo_omie_bloquear_edicao_fiscal();

CREATE FUNCTION public.mimo_omie_operar_nfe(
  _empresa uuid, _ator uuid, _pedido uuid, _versao integer, _app text, _acao text,
  _assinatura text DEFAULT NULL, _chave text DEFAULT NULL, _numero text DEFAULT NULL, _data date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  pedido public.mimo_tira_pedidos;
  envio public.mimo_omie_envios;
  reservada boolean := false;
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
  SELECT * INTO envio FROM public.mimo_omie_envios
  WHERE pedido_id = _pedido AND empresa_id = _empresa AND chave_app = _app;
  IF envio.codigo_omie IS NULL THEN
    RETURN NULL;
  END IF;
  IF _acao NOT IN ('consultar', 'reservar', 'confirmar') OR _acao IS NULL THEN
    RAISE EXCEPTION 'Acao fiscal invalida.';
  END IF;
  IF envio.nfe_chave IS NULL THEN
    IF pedido.versao IS DISTINCT FROM _versao OR envio.versao IS DISTINCT FROM _versao
      OR pedido.status <> 'confirmado'
      OR (pedido.documento->'pagamento'->>'forma' = 'pix' AND pedido.pix IS NULL) THEN
      RAISE EXCEPTION 'Pedido indisponivel ou alterado depois do envio ao Omie.' USING ERRCODE = '40001';
    END IF;
    IF _acao <> 'consultar' AND envio.assinatura_comercial IS DISTINCT FROM _assinatura THEN
      RAISE EXCEPTION 'Pedido divergente no Omie.' USING ERRCODE = '40001';
    END IF;
    IF _acao = 'reservar' AND envio.faturamento_reservado_em IS NULL THEN
      UPDATE public.mimo_omie_envios
      SET faturamento_reservado_em = clock_timestamp(), faturamento_ator = _ator
      WHERE pedido_id = _pedido RETURNING * INTO envio;
      reservada := true;
    ELSIF _acao = 'confirmar' THEN
      IF _chave IS NULL OR _numero IS NULL OR _data IS NULL THEN
        RAISE EXCEPTION 'Identidade da NF-e obrigatoria.';
      END IF;
      UPDATE public.mimo_omie_envios SET nfe_chave = _chave, nfe_numero = _numero, nfe_data = _data
      WHERE pedido_id = _pedido RETURNING * INTO envio;
      PERFORM public.mimo_tira_status(_empresa, _ator, _pedido, _versao, 'faturado', NULL, to_char(_data, 'YYYY-MM-DD'));
    END IF;
  ELSIF _acao = 'confirmar' AND envio.nfe_chave IS DISTINCT FROM _chave THEN
    RAISE EXCEPTION 'Uma NF-e diferente ja consta no pedido.' USING ERRCODE = '40001';
  END IF;
  RETURN jsonb_build_object(
    'codigo', envio.codigo_omie, 'numero', envio.numero_omie,
    'assinatura', envio.assinatura_comercial, 'reservada', reservada,
    'pendente', envio.faturamento_reservado_em IS NOT NULL AND envio.nfe_chave IS NULL,
    'nfe', envio.nfe_numero
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mimo_omie_operar_nfe(uuid, uuid, uuid, integer, text, text, text, text, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_omie_operar_nfe(uuid, uuid, uuid, integer, text, text, text, text, text, date)
  TO service_role;
