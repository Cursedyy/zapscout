-- Prepared only. Apply through the official migrator after backup verification.
-- This release audits simulations only; it cannot authorize an OMIE write.
CREATE TABLE public.mimo_omie_previas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  pedido_id bigint NOT NULL CHECK (pedido_id BETWEEN 1 AND 9007199254740991),
  versao text NOT NULL CHECK (versao ~ '^[a-f0-9]{64}$'),
  chave_idempotencia text NOT NULL CHECK (chave_idempotencia ~ '^[a-f0-9]{64}$'),
  mudancas jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'previa' CHECK (estado IN ('previa','simulada','obsoleta','expirada')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expira_em timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '10 minutes'),
  UNIQUE (empresa_id,ator_id,pedido_id,chave_idempotencia)
);
CREATE TABLE public.mimo_omie_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previa_id uuid NOT NULL REFERENCES public.mimo_omie_previas(id),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  ator_id uuid NOT NULL REFERENCES auth.users(id),
  pedido_id bigint NOT NULL,
  mudancas jsonb NOT NULL,
  resultado text NOT NULL CHECK (resultado IN ('previa','simulada','obsoleta','expirada')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (previa_id, resultado)
);
CREATE INDEX mimo_omie_previas_ator ON public.mimo_omie_previas(empresa_id,ator_id,created_at DESC);
CREATE INDEX mimo_omie_auditoria_empresa ON public.mimo_omie_auditoria(empresa_id,created_at DESC);
ALTER TABLE public.mimo_omie_previas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_omie_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_omie_previas, public.mimo_omie_auditoria FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.mimo_omie_previas, public.mimo_omie_auditoria TO authenticated;
CREATE POLICY mimo_omie_previas_ler ON public.mimo_omie_previas FOR SELECT TO authenticated USING (
  ator_id = (SELECT auth.uid()) AND empresa_id IN (
    SELECT id FROM public.empresas WHERE slug='mimo' AND ativa
    AND public.tem_papel_empresa(id,(SELECT auth.uid()),ARRAY['administrador','gestor']::public.empresa_papel[])
  )
);
CREATE POLICY mimo_omie_auditoria_ler ON public.mimo_omie_auditoria FOR SELECT TO authenticated USING (
  empresa_id IN (
    SELECT id FROM public.empresas WHERE slug='mimo' AND ativa
    AND public.tem_papel_empresa(id,(SELECT auth.uid()),ARRAY['administrador','gestor']::public.empresa_papel[])
  )
);
CREATE FUNCTION public.mimo_omie_auditoria_imutavel() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Auditoria imutavel'; END;
$$;
REVOKE ALL ON FUNCTION public.mimo_omie_auditoria_imutavel() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mimo_omie_auditoria_imutavel BEFORE UPDATE OR DELETE ON public.mimo_omie_auditoria
FOR EACH ROW EXECUTE FUNCTION public.mimo_omie_auditoria_imutavel();

CREATE FUNCTION public.mimo_omie_preparar(p_empresa uuid,p_ator uuid,p_pedido bigint,p_versao text,p_mudancas jsonb,p_idempotencia text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE nova public.mimo_omie_previas; item jsonb;
BEGIN
  PERFORM 1 FROM public.empresas e JOIN public.empresa_membros m ON m.empresa_id=e.id
  WHERE e.id=p_empresa AND e.slug='mimo' AND e.ativa AND m.user_id=p_ator AND m.ativo
    AND m.papel IN ('administrador','gestor') FOR SHARE OF e,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  IF p_mudancas IS NULL OR jsonb_typeof(p_mudancas)<>'array' THEN RAISE EXCEPTION 'Mudancas invalidas'; END IF;
  IF p_idempotencia IS NULL OR p_idempotencia !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Idempotencia invalida'; END IF;
  IF jsonb_array_length(p_mudancas) NOT BETWEEN 1 AND 199 THEN RAISE EXCEPTION 'Mudancas invalidas'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_mudancas) LOOP
    IF jsonb_typeof(item)<>'object' OR NOT (item ?& ARRAY['itemId','anterior','novo'])
      OR item - ARRAY['itemId','anterior','novo'] <> '{}'::jsonb
      OR jsonb_typeof(item->'itemId')<>'number' OR (item->>'itemId') !~ '^[1-9][0-9]*$'
      OR (item->>'itemId')::numeric > 9007199254740991
      OR jsonb_typeof(item->'anterior')<>'string' OR (item->>'anterior') !~ '^[0-9][.]?[0-9]{3}$'
      OR jsonb_typeof(item->'novo')<>'string' OR (item->>'novo') !~ '^[0-9][.][0-9]{3}$'
      OR replace(item->>'anterior','.','')=replace(item->>'novo','.','')
    THEN RAISE EXCEPTION 'Mudanca invalida'; END IF;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'itemId') FROM jsonb_array_elements(p_mudancas))<>jsonb_array_length(p_mudancas)
    THEN RAISE EXCEPTION 'Item duplicado'; END IF;
  INSERT INTO public.mimo_omie_previas(empresa_id,ator_id,pedido_id,versao,chave_idempotencia,mudancas)
    VALUES(p_empresa,p_ator,p_pedido,p_versao,p_idempotencia,p_mudancas)
    ON CONFLICT (empresa_id,ator_id,pedido_id,chave_idempotencia) DO NOTHING RETURNING * INTO nova;
  IF NOT FOUND THEN
    SELECT * INTO STRICT nova FROM public.mimo_omie_previas
      WHERE empresa_id=p_empresa AND ator_id=p_ator AND pedido_id=p_pedido
        AND chave_idempotencia=p_idempotencia;
    IF nova.versao IS DISTINCT FROM p_versao OR nova.mudancas IS DISTINCT FROM p_mudancas
      THEN RAISE EXCEPTION 'Colisao de idempotencia'; END IF;
    RETURN nova.id;
  END IF;
  INSERT INTO public.mimo_omie_auditoria(previa_id,empresa_id,ator_id,pedido_id,mudancas,resultado)
    VALUES(nova.id,p_empresa,p_ator,p_pedido,p_mudancas,'previa');
  RETURN nova.id;
END;
$$;
CREATE FUNCTION public.mimo_omie_confirmar(p_empresa uuid,p_ator uuid,p_id uuid,p_versao text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE previa public.mimo_omie_previas; resultado text;
BEGIN
  PERFORM 1 FROM public.empresas e JOIN public.empresa_membros m ON m.empresa_id=e.id
  WHERE e.id=p_empresa AND e.slug='mimo' AND e.ativa AND m.user_id=p_ator AND m.ativo
    AND m.papel IN ('administrador','gestor') FOR SHARE OF e,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO previa FROM public.mimo_omie_previas WHERE id=p_id AND empresa_id=p_empresa AND ator_id=p_ator FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  IF previa.estado<>'previa' THEN RETURN previa.estado; END IF;
  resultado:=CASE WHEN previa.expira_em<=clock_timestamp() THEN 'expirada'
    WHEN p_versao IS DISTINCT FROM previa.versao THEN 'obsoleta' ELSE 'simulada' END;
  UPDATE public.mimo_omie_previas SET estado=resultado WHERE id=previa.id;
  INSERT INTO public.mimo_omie_auditoria(previa_id,empresa_id,ator_id,pedido_id,mudancas,resultado)
    VALUES(previa.id,p_empresa,p_ator,previa.pedido_id,previa.mudancas,resultado);
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.mimo_omie_preparar(uuid,uuid,bigint,text,jsonb,text),public.mimo_omie_confirmar(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_omie_preparar(uuid,uuid,bigint,text,jsonb,text),public.mimo_omie_confirmar(uuid,uuid,uuid,text) TO service_role;
