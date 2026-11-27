CREATE TABLE public.mimo_frenet_remessas (
  empresa_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  codigo text NOT NULL CHECK (codigo ~ '^[A-Z0-9][A-Z0-9-]{0,79}$'),
  servico text NOT NULL CHECK (servico ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  registrado_por uuid NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (empresa_id, pedido_id, codigo),
  UNIQUE (empresa_id, servico, codigo),
  FOREIGN KEY (empresa_id, pedido_id) REFERENCES public.mimo_tira_pedidos (empresa_id, id)
);

ALTER TABLE public.mimo_frenet_remessas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_frenet_remessas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (empresa_id, pedido_id, codigo, servico) ON public.mimo_frenet_remessas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.mimo_frenet_remessas TO service_role;

CREATE POLICY mimo_frenet_remessas_ler ON public.mimo_frenet_remessas FOR SELECT TO authenticated
USING (
  public.tem_papel_empresa(empresa_id, auth.uid(),
    ARRAY['administrador','gestor','administrativo','vendedor']::public.empresa_papel[])
  AND EXISTS (
    SELECT 1 FROM public.mimo_tira_pedidos_seguros p
    WHERE p.empresa_id = mimo_frenet_remessas.empresa_id
      AND p.id = mimo_frenet_remessas.pedido_id
      AND p.status IN ('faturado','enviado','entregue')
  )
);

CREATE FUNCTION public.mimo_frenet_vincular_remessa(
  _empresa uuid, _ator uuid, _pedido uuid, _codigo text, _servico text,
  _codigo_anterior text, _servico_anterior text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  pedido public.mimo_tira_pedidos;
BEGIN
  SELECT * INTO pedido FROM public.mimo_tira_pedidos p
  WHERE p.id = _pedido AND p.empresa_id = _empresa FOR UPDATE;
  IF NOT FOUND OR pedido.status NOT IN ('faturado','enviado','entregue') THEN
    RAISE EXCEPTION 'pedido indisponível' USING ERRCODE = '42501';
  END IF;

  IF public.mimo_tira_ator(_empresa, _ator, pedido.lead_id, false)
      NOT IN ('administrador','gestor','administrativo') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;

  IF _codigo_anterior IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.mimo_frenet_remessas
      WHERE empresa_id = _empresa AND pedido_id = _pedido AND codigo = _codigo AND servico = _servico) THEN
      RETURN;
    END IF;
    IF (SELECT count(*) FROM public.mimo_frenet_remessas
      WHERE empresa_id = _empresa AND pedido_id = _pedido) >= 100 THEN
      RAISE EXCEPTION 'limite de códigos por pedido' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.mimo_frenet_remessas (empresa_id, pedido_id, codigo, servico, registrado_por)
    VALUES (_empresa, _pedido, _codigo, _servico, _ator);
  ELSE
    UPDATE public.mimo_frenet_remessas
    SET codigo = _codigo, servico = _servico, registrado_por = _ator, registrado_em = clock_timestamp()
    WHERE empresa_id = _empresa AND pedido_id = _pedido
      AND codigo = _codigo_anterior AND servico = _servico_anterior;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rastreio alterado' USING ERRCODE = '40001';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mimo_frenet_vincular_remessa(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_frenet_vincular_remessa(uuid,uuid,uuid,text,text,text,text) TO service_role;
