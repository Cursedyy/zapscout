-- PREPARADA, NÃO APLICADA. Requer backup verificado antes da ferramenta de migração.
-- Ordem: aplicar depois de mimo-retorno-campanhas-ids-meta.sql (colunas campanha_id/anuncio_id
-- em mimo_meta_ads_metricas, usadas para resolver anúncio → campanha Meta → código).
--
-- Código de campanha (centro de custo de marketing) por empresa:
--   * cadastro mantido por administrador/gestor/marketing/líder de marketing, só por RPCs auditadas;
--   * cada campanha Meta (ID numérico) pertence a no máximo um código;
--   * investimento manual (ações fora do Meta) em centavos, só acrescentado ou anulado, nunca editado;
--   * o lead guarda o código (manual no editor ou automático pelo anúncio do WhatsApp);
--   * pedidos herdam o código pelo lead_id exato. Nada é inferido por nome/UTM/texto.
-- Totais de pedidos continuam fora de mimo_leads.valor_pedido/conversao_em.

-- 1. Autorização ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mimo_codigo_campanha_gestor(_empresa uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = _empresa AND e.slug = 'mimo' AND e.ativa)
    AND public.is_membro_empresa(_empresa, _uid)
    AND public.empresa_papel_de(_empresa, _uid)::text IN ('administrador','gestor','marketing','lider_marketing')
$$;
REVOKE ALL ON FUNCTION public.mimo_codigo_campanha_gestor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_codigo_campanha_gestor(uuid, uuid) TO authenticated, service_role;

-- 2. Tabelas -------------------------------------------------------------------------------

CREATE TABLE public.mimo_campanhas_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  codigo text NOT NULL CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  descricao text NOT NULL DEFAULT '' CHECK (length(descricao) <= 1000),
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  atualizado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (empresa_id, codigo),
  UNIQUE (empresa_id, id)
);
COMMENT ON TABLE public.mimo_campanhas_codigos IS 'Código de campanha/centro de custo de marketing. O código é imutável depois de criado; arquivar (ativo=false) impede novos vínculos em leads.';

-- Cada campanha Meta pertence a um único código na empresa (chave primária).
CREATE TABLE public.mimo_campanhas_codigos_meta (
  empresa_id uuid NOT NULL,
  campanha_id text NOT NULL CHECK (campanha_id ~ '^[0-9]{1,40}$'),
  codigo_id uuid NOT NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, campanha_id),
  FOREIGN KEY (empresa_id, codigo_id) REFERENCES public.mimo_campanhas_codigos(empresa_id, id)
);
CREATE INDEX mimo_campanhas_codigos_meta_codigo ON public.mimo_campanhas_codigos_meta(empresa_id, codigo_id);

CREATE TABLE public.mimo_campanhas_codigos_investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  codigo_id uuid NOT NULL,
  competencia date NOT NULL CHECK (competencia >= DATE '2020-01-01'),
  valor_centavos bigint NOT NULL CHECK (valor_centavos BETWEEN 0 AND 100000000000),
  descricao text NOT NULL CHECK (length(btrim(descricao)) BETWEEN 2 AND 300),
  lancado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  anulado_em timestamptz,
  anulado_por uuid REFERENCES auth.users(id),
  motivo_anulacao text NOT NULL DEFAULT '' CHECK (length(motivo_anulacao) <= 300),
  CHECK ((anulado_em IS NULL) = (anulado_por IS NULL)),
  FOREIGN KEY (empresa_id, codigo_id) REFERENCES public.mimo_campanhas_codigos(empresa_id, id)
);
CREATE INDEX mimo_campanhas_codigos_investimentos_periodo
  ON public.mimo_campanhas_codigos_investimentos(empresa_id, competencia) WHERE anulado_em IS NULL;

CREATE TABLE public.mimo_campanhas_codigos_historico (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL,
  codigo_id uuid NOT NULL,
  alterado_por uuid,
  acao text NOT NULL CHECK (acao IN ('cadastro','edicao','vinculos_meta','investimento','anulacao','historico_leads')),
  anterior jsonb,
  atual jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (empresa_id, codigo_id) REFERENCES public.mimo_campanhas_codigos(empresa_id, id)
);
CREATE INDEX mimo_campanhas_codigos_historico_codigo
  ON public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, created_at DESC);

-- 3. RLS: leitura por membros (cadastro e vínculos) ou gestão de marketing (valores/histórico);
--    nenhuma escrita direta do navegador.

ALTER TABLE public.mimo_campanhas_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_campanhas_codigos_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_campanhas_codigos_investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_campanhas_codigos_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_campanhas_codigos, public.mimo_campanhas_codigos_meta,
  public.mimo_campanhas_codigos_investimentos, public.mimo_campanhas_codigos_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mimo_campanhas_codigos, public.mimo_campanhas_codigos_meta,
  public.mimo_campanhas_codigos_investimentos, public.mimo_campanhas_codigos_historico TO authenticated;
GRANT ALL ON public.mimo_campanhas_codigos, public.mimo_campanhas_codigos_meta,
  public.mimo_campanhas_codigos_investimentos, public.mimo_campanhas_codigos_historico TO service_role;

CREATE POLICY codigos_ler ON public.mimo_campanhas_codigos FOR SELECT TO authenticated USING (
  public.is_membro_empresa(empresa_id, auth.uid())
  AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.slug = 'mimo' AND e.ativa));
CREATE POLICY codigos_meta_ler ON public.mimo_campanhas_codigos_meta FOR SELECT TO authenticated USING (
  public.is_membro_empresa(empresa_id, auth.uid())
  AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.slug = 'mimo' AND e.ativa));
CREATE POLICY codigos_investimentos_ler ON public.mimo_campanhas_codigos_investimentos FOR SELECT TO authenticated
  USING (public.mimo_codigo_campanha_gestor(empresa_id, auth.uid()));
CREATE POLICY codigos_historico_ler ON public.mimo_campanhas_codigos_historico FOR SELECT TO authenticated
  USING (public.mimo_codigo_campanha_gestor(empresa_id, auth.uid()));

-- 4. Código no lead ------------------------------------------------------------------------

ALTER TABLE public.mimo_leads
  ADD COLUMN campanha_codigo_id uuid,
  ADD COLUMN campanha_codigo_origem text,
  ADD CONSTRAINT mimo_leads_campanha_codigo_fk FOREIGN KEY (empresa_id, campanha_codigo_id)
    REFERENCES public.mimo_campanhas_codigos(empresa_id, id),
  ADD CONSTRAINT mimo_leads_campanha_codigo_origem_check CHECK (
    campanha_codigo_origem IN ('manual','anuncio_meta')
    AND campanha_codigo_id IS NOT NULL
    OR campanha_codigo_origem IS NULL AND campanha_codigo_id IS NULL);
CREATE INDEX mimo_leads_campanha_codigo ON public.mimo_leads(empresa_id, campanha_codigo_id)
  WHERE campanha_codigo_id IS NOT NULL;

-- Só códigos ativos podem ser atribuídos; a origem é derivada no banco (nunca do cliente).
-- O histórico do lead continua no trigger existente mimo_lead_auditar (to_jsonb do registro).
CREATE OR REPLACE FUNCTION public.mimo_lead_codigo_campanha() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.campanha_codigo_id IS NOT DISTINCT FROM OLD.campanha_codigo_id THEN
    NEW.campanha_codigo_origem := OLD.campanha_codigo_origem;
    RETURN NEW;
  END IF;
  IF NEW.campanha_codigo_id IS NULL THEN
    NEW.campanha_codigo_origem := NULL;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mimo_campanhas_codigos c
                 WHERE c.empresa_id = NEW.empresa_id AND c.id = NEW.campanha_codigo_id AND c.ativo) THEN
    RAISE EXCEPTION 'Código de campanha arquivado ou inexistente' USING ERRCODE = '23514';
  END IF;
  NEW.campanha_codigo_origem := CASE
    WHEN current_setting('mimo.codigo_campanha_automatico', true) = 'on' THEN 'anuncio_meta'
    ELSE 'manual' END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_lead_codigo_campanha() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mimo_lead_codigo_campanha
  BEFORE INSERT OR UPDATE OF campanha_codigo_id, campanha_codigo_origem ON public.mimo_leads
  FOR EACH ROW EXECUTE FUNCTION public.mimo_lead_codigo_campanha();

-- 5. Resolução exata anúncio → campanha Meta → código ----------------------------------------
-- O anúncio precisa aparecer no CSV Meta com exatamente UMA campanha_id, e essa campanha precisa
-- estar vinculada a um código ativo. Qualquer ambiguidade devolve NULL (fica sem código).

CREATE OR REPLACE FUNCTION public.mimo_codigo_campanha_por_anuncio(_empresa uuid, _anuncio text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH campanhas AS (
    SELECT DISTINCT m.campanha_id FROM public.mimo_meta_ads_metricas m
    WHERE m.empresa_id = _empresa AND m.anuncio_id = _anuncio AND m.campanha_id <> ''
      AND _anuncio ~ '^[0-9]{1,40}$'
  )
  SELECT c.id FROM campanhas x
  JOIN public.mimo_campanhas_codigos_meta v ON v.empresa_id = _empresa AND v.campanha_id = x.campanha_id
  JOIN public.mimo_campanhas_codigos c ON c.empresa_id = v.empresa_id AND c.id = v.codigo_id AND c.ativo
  WHERE (SELECT count(*) FROM campanhas) = 1
$$;
REVOKE ALL ON FUNCTION public.mimo_codigo_campanha_por_anuncio(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_codigo_campanha_por_anuncio(uuid, text) TO service_role;

-- Captura automática: só evento recebido com metadado de anúncio autenticado pelo provedor
-- (fonte metadado_whatsapp) e lead ainda sem código. Nunca sobrescreve escolha manual.
-- Falhas não interrompem a ingestão do WhatsApp; o lead apenas fica sem código.
CREATE OR REPLACE FUNCTION public.mimo_lead_codigo_por_anuncio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _codigo uuid;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.direcao <> 'recebida' OR NEW.referencia_anuncio IS NULL
     OR jsonb_typeof(NEW.referencia_anuncio) <> 'object'
     OR NEW.referencia_anuncio->>'fonte' IS DISTINCT FROM 'metadado_whatsapp'
     OR coalesce(NEW.referencia_anuncio->>'id', '') !~ '^[0-9]{1,40}$' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.referencia_anuncio IS NOT DISTINCT FROM NEW.referencia_anuncio
     AND OLD.lead_id IS NOT DISTINCT FROM NEW.lead_id THEN
    RETURN NEW;
  END IF;
  BEGIN
    _codigo := public.mimo_codigo_campanha_por_anuncio(NEW.empresa_id, NEW.referencia_anuncio->>'id');
    IF _codigo IS NOT NULL THEN
      PERFORM set_config('mimo.codigo_campanha_automatico', 'on', true);
      UPDATE public.mimo_leads SET campanha_codigo_id = _codigo
        WHERE id = NEW.lead_id AND empresa_id = NEW.empresa_id AND campanha_codigo_id IS NULL;
      PERFORM set_config('mimo.codigo_campanha_automatico', '', true);
    END IF;
  EXCEPTION WHEN others THEN
    PERFORM set_config('mimo.codigo_campanha_automatico', '', true);
    RAISE WARNING 'mimo_lead_codigo_por_anuncio: %', SQLSTATE;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_lead_codigo_por_anuncio() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mimo_lead_codigo_por_anuncio
  AFTER INSERT OR UPDATE OF referencia_anuncio, lead_id ON public.mimo_whatsapp_eventos
  FOR EACH ROW EXECUTE FUNCTION public.mimo_lead_codigo_por_anuncio();

-- 6. RPCs de cadastro ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mimo_codigo_campanha_salvar(
  _empresa uuid, _id uuid, _versao integer, _codigo text, _nome text, _descricao text,
  _ativo boolean, _campanhas_meta text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _atual public.mimo_campanhas_codigos;
  _novo public.mimo_campanhas_codigos;
  _antes text[];
  _depois text[];
BEGIN
  IF NOT public.mimo_codigo_campanha_gestor(_empresa, _uid) THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;
  _codigo := upper(btrim(coalesce(_codigo, '')));
  _nome := btrim(coalesce(_nome, ''));
  _descricao := btrim(coalesce(_descricao, ''));
  IF _codigo !~ '^[A-Z0-9][A-Z0-9_-]{1,39}$' OR length(_nome) NOT BETWEEN 2 AND 120
     OR length(_descricao) > 1000 OR _ativo IS NULL THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = '22023';
  END IF;
  _depois := ARRAY(SELECT DISTINCT btrim(x) FROM unnest(coalesce(_campanhas_meta, '{}'::text[])) x ORDER BY 1);
  IF coalesce(array_length(_depois, 1), 0) > 100
     OR EXISTS (SELECT 1 FROM unnest(_depois) x WHERE x !~ '^[0-9]{1,40}$') THEN
    RAISE EXCEPTION 'id_meta_invalido' USING ERRCODE = '22023';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.mimo_campanhas_codigos(empresa_id, codigo, nome, descricao, ativo, criado_por, atualizado_por)
    VALUES (_empresa, _codigo, _nome, _descricao, _ativo, _uid, _uid)
    RETURNING * INTO _novo;
    INSERT INTO public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, alterado_por, acao, atual)
    VALUES (_empresa, _novo.id, _uid, 'cadastro', to_jsonb(_novo));
  ELSE
    SELECT * INTO _atual FROM public.mimo_campanhas_codigos
      WHERE empresa_id = _empresa AND id = _id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'codigo_inexistente' USING ERRCODE = 'P0002'; END IF;
    IF _versao IS DISTINCT FROM _atual.versao THEN
      RAISE EXCEPTION 'versao_desatualizada' USING ERRCODE = '40001';
    END IF;
    IF _codigo <> _atual.codigo THEN RAISE EXCEPTION 'codigo_imutavel' USING ERRCODE = '22023'; END IF;
    UPDATE public.mimo_campanhas_codigos
      SET nome = _nome, descricao = _descricao, ativo = _ativo, versao = versao + 1,
          atualizado_por = _uid, updated_at = clock_timestamp()
      WHERE empresa_id = _empresa AND id = _id
      RETURNING * INTO _novo;
    INSERT INTO public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, alterado_por, acao, anterior, atual)
    VALUES (_empresa, _novo.id, _uid, 'edicao', to_jsonb(_atual), to_jsonb(_novo));
  END IF;

  _antes := ARRAY(SELECT campanha_id FROM public.mimo_campanhas_codigos_meta
                  WHERE empresa_id = _empresa AND codigo_id = _novo.id ORDER BY 1);
  IF _antes IS DISTINCT FROM _depois THEN
    DELETE FROM public.mimo_campanhas_codigos_meta
      WHERE empresa_id = _empresa AND codigo_id = _novo.id AND NOT (campanha_id = ANY(_depois));
    INSERT INTO public.mimo_campanhas_codigos_meta(empresa_id, campanha_id, codigo_id, criado_por)
      SELECT _empresa, x, _novo.id, _uid FROM unnest(_depois) x
      ON CONFLICT (empresa_id, campanha_id) DO NOTHING;
    IF EXISTS (SELECT 1 FROM public.mimo_campanhas_codigos_meta v
               WHERE v.empresa_id = _empresa AND v.campanha_id = ANY(_depois) AND v.codigo_id <> _novo.id) THEN
      RAISE EXCEPTION 'meta_ja_vinculada' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, alterado_por, acao, anterior, atual)
    VALUES (_empresa, _novo.id, _uid, 'vinculos_meta',
            jsonb_build_object('campanhas_meta', to_jsonb(_antes)), jsonb_build_object('campanhas_meta', to_jsonb(_depois)));
  END IF;
  RETURN jsonb_build_object('id', _novo.id, 'versao', _novo.versao);
END $$;

CREATE OR REPLACE FUNCTION public.mimo_codigo_campanha_lancar_investimento(
  _empresa uuid, _codigo uuid, _competencia date, _valor_centavos bigint, _descricao text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _novo public.mimo_campanhas_codigos_investimentos;
BEGIN
  IF NOT public.mimo_codigo_campanha_gestor(_empresa, _uid) THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.mimo_campanhas_codigos WHERE empresa_id = _empresa AND id = _codigo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'codigo_inexistente' USING ERRCODE = 'P0002'; END IF;
  IF _competencia IS NULL OR _competencia > (now() AT TIME ZONE 'America/Sao_Paulo')::date
     OR _valor_centavos IS NULL OR length(btrim(coalesce(_descricao, ''))) NOT BETWEEN 2 AND 300 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mimo_campanhas_codigos_investimentos(empresa_id, codigo_id, competencia, valor_centavos, descricao, lancado_por)
  VALUES (_empresa, _codigo, _competencia, _valor_centavos, btrim(_descricao), _uid)
  RETURNING * INTO _novo;
  INSERT INTO public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, alterado_por, acao, atual)
  VALUES (_empresa, _codigo, _uid, 'investimento', to_jsonb(_novo));
  RETURN _novo.id;
END $$;

CREATE OR REPLACE FUNCTION public.mimo_codigo_campanha_anular_investimento(_empresa uuid, _id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _atual public.mimo_campanhas_codigos_investimentos; _novo public.mimo_campanhas_codigos_investimentos;
BEGIN
  IF NOT public.mimo_codigo_campanha_gestor(_empresa, _uid) THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_motivo, ''))) NOT BETWEEN 2 AND 300 THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _atual FROM public.mimo_campanhas_codigos_investimentos
    WHERE empresa_id = _empresa AND id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'investimento_inexistente' USING ERRCODE = 'P0002'; END IF;
  IF _atual.anulado_em IS NOT NULL THEN RAISE EXCEPTION 'ja_anulado' USING ERRCODE = '40001'; END IF;
  UPDATE public.mimo_campanhas_codigos_investimentos
    SET anulado_em = clock_timestamp(), anulado_por = _uid, motivo_anulacao = btrim(_motivo)
    WHERE empresa_id = _empresa AND id = _id RETURNING * INTO _novo;
  INSERT INTO public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, alterado_por, acao, anterior, atual)
  VALUES (_empresa, _atual.codigo_id, _uid, 'anulacao', to_jsonb(_atual), to_jsonb(_novo));
END $$;

-- Histórico: preenche, sob demanda da administração/gestão, apenas leads SEM código cujos eventos
-- recebidos com anúncio autenticado resolvem para exatamente um código. Cada alteração entra no
-- histórico do lead (trigger existente) com o ator que executou.
CREATE OR REPLACE FUNCTION public.mimo_codigo_campanha_preencher_historico(_empresa uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _total integer := 0; r record;
BEGIN
  IF _uid IS NULL OR NOT public.mimo_codigo_campanha_gestor(_empresa, _uid)
     OR public.empresa_papel_de(_empresa, _uid)::text NOT IN ('administrador','gestor') THEN
    RAISE EXCEPTION 'acesso_negado' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('mimo.codigo_campanha_automatico', 'on', true);
  FOR r IN
    WITH resolvidos AS (
      SELECT e.lead_id, public.mimo_codigo_campanha_por_anuncio(_empresa, e.referencia_anuncio->>'id') AS codigo_id
      FROM public.mimo_whatsapp_eventos e
      JOIN public.mimo_leads l ON l.id = e.lead_id AND l.empresa_id = _empresa AND l.campanha_codigo_id IS NULL
      WHERE e.empresa_id = _empresa AND e.direcao = 'recebida'
        AND jsonb_typeof(e.referencia_anuncio) = 'object'
        AND e.referencia_anuncio->>'fonte' = 'metadado_whatsapp'
        AND coalesce(e.referencia_anuncio->>'id', '') ~ '^[0-9]{1,40}$'
    )
    -- Eventos cujo anúncio não resolve não invalidam; dois códigos distintos deixam o lead sem código.
    SELECT lead_id, min(codigo_id::text)::uuid AS codigo_id FROM resolvidos
    WHERE codigo_id IS NOT NULL
    GROUP BY lead_id HAVING count(DISTINCT codigo_id) = 1
  LOOP
    UPDATE public.mimo_leads SET campanha_codigo_id = r.codigo_id
      WHERE empresa_id = _empresa AND id = r.lead_id AND campanha_codigo_id IS NULL;
    IF FOUND THEN
      _total := _total + 1;
      INSERT INTO public.mimo_campanhas_codigos_historico(empresa_id, codigo_id, alterado_por, acao, atual)
      VALUES (_empresa, r.codigo_id, _uid, 'historico_leads', jsonb_build_object('lead_id', r.lead_id));
    END IF;
  END LOOP;
  PERFORM set_config('mimo.codigo_campanha_automatico', '', true);
  RETURN _total;
END $$;

REVOKE ALL ON FUNCTION
  public.mimo_codigo_campanha_salvar(uuid, uuid, integer, text, text, text, boolean, text[]),
  public.mimo_codigo_campanha_lancar_investimento(uuid, uuid, date, bigint, text),
  public.mimo_codigo_campanha_anular_investimento(uuid, uuid, text),
  public.mimo_codigo_campanha_preencher_historico(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.mimo_codigo_campanha_salvar(uuid, uuid, integer, text, text, text, boolean, text[]),
  public.mimo_codigo_campanha_lancar_investimento(uuid, uuid, date, bigint, text),
  public.mimo_codigo_campanha_anular_investimento(uuid, uuid, text),
  public.mimo_codigo_campanha_preencher_historico(uuid)
  TO authenticated;
