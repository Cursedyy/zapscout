-- PREPARADO, NAO APLICADO. Aplicar somente apos backup confirmado e validacao isolada, pelo migrador oficial.
-- Representantes comerciais externos (sem login): cadastro com comissao fixa em pontos-base,
-- territorio por UF (principal/secundario), atribuicao manual por unidade da carteira e historico append-only.
-- Leitura: somente administrador/gestor (RLS). Escrita: somente pelos RPCs abaixo, que conferem o papel.
-- Nao altera pedidos, leads, carteira nem o cadastro publico de candidatos (mimo_representantes).
BEGIN;

CREATE FUNCTION public.mimo_rep_uf_valida(_uf text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT _uf = ANY(ARRAY['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])
$$;

-- Mesma chave da aplicacao: espacos colapsados, minusculas, sem acentos do portugues.
CREATE FUNCTION public.mimo_rep_chave(_nome text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT translate(lower(btrim(regexp_replace(coalesce(_nome,''),'\s+',' ','g'))),
  U&'\00E1\00E0\00E2\00E3\00E4\00E9\00E8\00EA\00EB\00ED\00EC\00EE\00EF\00F3\00F2\00F4\00F5\00F6\00FA\00F9\00FB\00FC\00E7\00F1',
  'aaaaaeeeeiiiiooooouuuucn')
$$;

CREATE TABLE public.mimo_rep_comerciais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 2 AND 200),
 chave text NOT NULL,
 ativo boolean NOT NULL DEFAULT true,
 comissao_bps integer NOT NULL CHECK(comissao_bps BETWEEN 0 AND 10000),
 telefone text NOT NULL DEFAULT '' CHECK(length(telefone)<=40),
 email text NOT NULL DEFAULT '' CHECK(length(email)<=200),
 observacoes text NOT NULL DEFAULT '' CHECK(length(observacoes)<=2000),
 versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
 criado_por uuid NOT NULL, atualizado_por uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(empresa_id,id), UNIQUE(empresa_id,chave),
 CHECK(chave=public.mimo_rep_chave(nome))
);

CREATE TABLE public.mimo_rep_comerciais_territorios (
 empresa_id uuid NOT NULL,
 uf text NOT NULL CHECK(public.mimo_rep_uf_valida(uf)),
 representante_id uuid NOT NULL,
 principal boolean NOT NULL,
 regiao text NOT NULL DEFAULT '' CHECK(length(regiao)<=100),
 estado text NOT NULL DEFAULT '' CHECK(length(estado)<=100),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(empresa_id,uf,representante_id),
 FOREIGN KEY(empresa_id,representante_id) REFERENCES public.mimo_rep_comerciais(empresa_id,id)
);
-- No maximo um principal por UF; os demais sao secundarios e so recebem clientes por atribuicao manual.
CREATE UNIQUE INDEX mimo_rep_territorio_principal ON public.mimo_rep_comerciais_territorios(empresa_id,uf) WHERE principal;
CREATE INDEX ON public.mimo_rep_comerciais_territorios(empresa_id,representante_id);

-- Atribuicao manual por unidade da carteira; representante_id nulo = segue o principal da UF.
CREATE TABLE public.mimo_rep_comerciais_clientes (
 empresa_id uuid NOT NULL,
 unidade_id uuid NOT NULL,
 representante_id uuid,
 motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 3 AND 500),
 versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
 atualizado_por uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(empresa_id,unidade_id),
 FOREIGN KEY(empresa_id,unidade_id) REFERENCES public.mimo_carteira_unidades(empresa_id,id),
 FOREIGN KEY(empresa_id,representante_id) REFERENCES public.mimo_rep_comerciais(empresa_id,id)
);
CREATE INDEX ON public.mimo_rep_comerciais_clientes(empresa_id,representante_id);

CREATE TABLE public.mimo_rep_comerciais_historico (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 entidade text NOT NULL CHECK(entidade IN ('representante','territorio','cliente','importacao')),
 referencia text NOT NULL,
 acao text NOT NULL,
 antes jsonb, depois jsonb,
 ator_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,created_at DESC);

CREATE FUNCTION public.mimo_rep_historico_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Historico de representantes e somente de insercao'; END $$;
CREATE TRIGGER mimo_rep_historico_sem_alteracao BEFORE UPDATE OR DELETE ON public.mimo_rep_comerciais_historico
 FOR EACH ROW EXECUTE FUNCTION public.mimo_rep_historico_imutavel();
CREATE TRIGGER mimo_rep_historico_sem_truncate BEFORE TRUNCATE ON public.mimo_rep_comerciais_historico
 FOR EACH STATEMENT EXECUTE FUNCTION public.mimo_rep_historico_imutavel();

ALTER TABLE public.mimo_rep_comerciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_rep_comerciais_territorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_rep_comerciais_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_rep_comerciais_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_rep_comerciais,public.mimo_rep_comerciais_territorios,public.mimo_rep_comerciais_clientes,public.mimo_rep_comerciais_historico FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mimo_rep_comerciais,public.mimo_rep_comerciais_territorios,public.mimo_rep_comerciais_clientes,public.mimo_rep_comerciais_historico TO authenticated;
-- Comissao e faturamento: somente administrador/gestor da empresa.
CREATE POLICY rep_comerciais_read ON public.mimo_rep_comerciais FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE POLICY rep_territorios_read ON public.mimo_rep_comerciais_territorios FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE POLICY rep_clientes_read ON public.mimo_rep_comerciais_clientes FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE POLICY rep_historico_read ON public.mimo_rep_comerciais_historico FOR SELECT TO authenticated
 USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));

-- Confere empresa MiMo ativa e papel de gestao do chamador, trava o vinculo e serializa escritas da empresa.
CREATE FUNCTION public.mimo_rep_exigir_gestao(_empresa uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ator uuid := auth.uid();
BEGIN
 IF ator IS NULL OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=ator AND ativo AND papel::text IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mimo_rep_comerciais:'||_empresa::text,0));
 RETURN ator;
END $$;
REVOKE ALL ON FUNCTION public.mimo_rep_exigir_gestao(uuid) FROM PUBLIC,anon,authenticated;

-- Substitui o conjunto de UFs de um representante (uso interno do cadastro).
CREATE FUNCTION public.mimo_rep_definir_territorios(_empresa uuid,_ator uuid,_rep uuid,_territorios jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; t public.mimo_rep_comerciais_territorios; v_uf text; v_principal boolean; outro text; n integer := 0;
BEGIN
 IF jsonb_typeof(_territorios) IS DISTINCT FROM 'array' OR jsonb_array_length(_territorios)>27 THEN RAISE EXCEPTION 'Territorios invalidos'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_territorios))<>(SELECT count(DISTINCT x->>'uf') FROM jsonb_array_elements(_territorios) x) THEN RAISE EXCEPTION 'UF repetida'; END IF;
 FOR t IN SELECT * FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND representante_id=_rep
  AND uf NOT IN (SELECT x->>'uf' FROM jsonb_array_elements(_territorios) x) ORDER BY uf FOR UPDATE LOOP
  DELETE FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND uf=t.uf AND representante_id=_rep;
  INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id) VALUES(_empresa,'territorio',t.uf,'remover',to_jsonb(t),NULL,_ator);
  n := n+1;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(_territorios) LOOP
  v_uf := e->>'uf';
  v_principal := coalesce((e->>'principal')::boolean,false);
  IF NOT coalesce(public.mimo_rep_uf_valida(v_uf),false) THEN RAISE EXCEPTION 'UF invalida: %',v_uf; END IF;
  IF v_principal THEN
   SELECT r.nome INTO outro FROM public.mimo_rep_comerciais_territorios x JOIN public.mimo_rep_comerciais r ON r.empresa_id=x.empresa_id AND r.id=x.representante_id
    WHERE x.empresa_id=_empresa AND x.uf=v_uf AND x.principal AND x.representante_id<>_rep;
   IF FOUND THEN RAISE EXCEPTION 'UF % ja tem representante principal (%). Torne-o secundario antes.',v_uf,outro; END IF;
  END IF;
  SELECT * INTO t FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND uf=v_uf AND representante_id=_rep FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO public.mimo_rep_comerciais_territorios(empresa_id,uf,representante_id,principal) VALUES(_empresa,v_uf,_rep,v_principal);
   INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id)
    VALUES(_empresa,'territorio',v_uf,'adicionar',NULL,jsonb_build_object('representante_id',_rep,'principal',v_principal),_ator);
   n := n+1;
  ELSIF t.principal<>v_principal THEN
   UPDATE public.mimo_rep_comerciais_territorios SET principal=v_principal,updated_at=clock_timestamp() WHERE empresa_id=_empresa AND uf=v_uf AND representante_id=_rep;
   INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id)
    VALUES(_empresa,'territorio',v_uf,'editar',to_jsonb(t),jsonb_build_object('representante_id',_rep,'principal',v_principal),_ator);
   n := n+1;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mimo_rep_definir_territorios(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;

-- Cria ou edita um representante (versao otimista) e substitui suas UFs, tudo na mesma transacao.
CREATE FUNCTION public.mimo_rep_comercial_salvar(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ator uuid; r public.mimo_rep_comerciais; antes jsonb;
 v_id uuid := nullif(_dados->>'id','')::uuid;
 v_nome text := btrim(regexp_replace(coalesce(_dados->>'nome',''),'\s+',' ','g'));
 v_bps integer := (_dados->>'comissao_bps')::integer;
 v_ativo boolean := coalesce((_dados->>'ativo')::boolean,true);
 v_tel text := btrim(coalesce(_dados->>'telefone',''));
 v_email text := lower(btrim(coalesce(_dados->>'email','')));
 v_obs text := coalesce(_dados->>'observacoes','');
BEGIN
 ator := public.mimo_rep_exigir_gestao(_empresa);
 IF length(v_nome) NOT BETWEEN 2 AND 200 OR v_bps IS NULL OR v_bps NOT BETWEEN 0 AND 10000 OR length(v_tel)>40 OR length(v_email)>200 OR length(v_obs)>2000 THEN RAISE EXCEPTION 'Dados invalidos'; END IF;
 IF EXISTS(SELECT 1 FROM public.mimo_rep_comerciais WHERE empresa_id=_empresa AND chave=public.mimo_rep_chave(v_nome) AND id IS DISTINCT FROM v_id) THEN
  RAISE EXCEPTION 'Ja existe representante com este nome';
 END IF;
 IF v_id IS NULL THEN
  INSERT INTO public.mimo_rep_comerciais(empresa_id,nome,chave,ativo,comissao_bps,telefone,email,observacoes,criado_por,atualizado_por)
   VALUES(_empresa,v_nome,public.mimo_rep_chave(v_nome),v_ativo,v_bps,v_tel,v_email,v_obs,ator,ator) RETURNING * INTO r;
  INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id) VALUES(_empresa,'representante',r.id::text,'criar',NULL,to_jsonb(r),ator);
 ELSE
  SELECT * INTO r FROM public.mimo_rep_comerciais WHERE empresa_id=_empresa AND id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Representante indisponivel'; END IF;
  IF r.versao IS DISTINCT FROM (_dados->>'versao')::integer THEN RAISE EXCEPTION 'Cadastro alterado por outra pessoa; reabra antes de salvar'; END IF;
  antes := to_jsonb(r);
  UPDATE public.mimo_rep_comerciais SET nome=v_nome,chave=public.mimo_rep_chave(v_nome),ativo=v_ativo,comissao_bps=v_bps,telefone=v_tel,email=v_email,observacoes=v_obs,
   versao=versao+1,atualizado_por=ator,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id) VALUES(_empresa,'representante',r.id::text,'editar',antes,to_jsonb(r),ator);
 END IF;
 PERFORM public.mimo_rep_definir_territorios(_empresa,ator,r.id,coalesce(_dados->'territorios','[]'::jsonb));
 RETURN to_jsonb(r);
END $$;

-- Importacao idempotente da planilha REGIAO|ESTADO|UF|REPRESENTANTE(S)|COMISSOES %|CONTAR UF.
-- Representantes por chave do nome (cria ou atualiza a comissao; nao altera ativo/contatos).
-- Para cada UF presente, o conjunto de representantes passa a ser exatamente o da planilha; UFs ausentes nao mudam.
-- Reimportar o mesmo conteudo nao altera dados (apenas registra a tentativa no historico).
CREATE FUNCTION public.mimo_rep_comerciais_importar(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ator uuid; e jsonb; r public.mimo_rep_comerciais; t public.mimo_rep_comerciais_territorios; antes jsonb;
 v_nome text; v_bps integer; v_uf text; v_rep uuid; v_principal boolean; v_antes_principal boolean; v_regiao text; v_estado text;
 ids uuid[]; principal_rep uuid; antigo_principal uuid;
 criados integer := 0; atualizados integer := 0; inalterados integer := 0; territorios integer := 0;
BEGIN
 ator := public.mimo_rep_exigir_gestao(_empresa);
 IF coalesce(_dados->>'hash','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(_dados->'representantes') IS DISTINCT FROM 'array' OR jsonb_typeof(_dados->'territorios') IS DISTINCT FROM 'array'
  OR jsonb_array_length(_dados->'representantes') NOT BETWEEN 1 AND 500 OR jsonb_array_length(_dados->'territorios')>2000 THEN RAISE EXCEPTION 'Importacao invalida'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_dados->'representantes'))<>(SELECT count(DISTINCT public.mimo_rep_chave(x->>'nome')) FROM jsonb_array_elements(_dados->'representantes') x) THEN
  RAISE EXCEPTION 'Representante repetido na importacao'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_dados->'representantes') LOOP
  v_nome := btrim(regexp_replace(coalesce(e->>'nome',''),'\s+',' ','g'));
  v_bps := (e->>'comissao_bps')::integer;
  IF length(v_nome) NOT BETWEEN 2 AND 200 OR v_bps IS NULL OR v_bps NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Representante invalido: %',v_nome; END IF;
  SELECT * INTO r FROM public.mimo_rep_comerciais WHERE empresa_id=_empresa AND chave=public.mimo_rep_chave(v_nome) FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO public.mimo_rep_comerciais(empresa_id,nome,chave,comissao_bps,criado_por,atualizado_por)
    VALUES(_empresa,v_nome,public.mimo_rep_chave(v_nome),v_bps,ator,ator) RETURNING * INTO r;
   INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id) VALUES(_empresa,'representante',r.id::text,'importar_criar',NULL,to_jsonb(r),ator);
   criados := criados+1;
  ELSIF r.comissao_bps<>v_bps THEN
   antes := to_jsonb(r);
   UPDATE public.mimo_rep_comerciais SET comissao_bps=v_bps,versao=versao+1,atualizado_por=ator,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
   INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id) VALUES(_empresa,'representante',r.id::text,'importar_editar',antes,to_jsonb(r),ator);
   atualizados := atualizados+1;
  ELSE
   inalterados := inalterados+1;
  END IF;
 END LOOP;
 FOR v_uf IN SELECT DISTINCT x->>'uf' FROM jsonb_array_elements(_dados->'territorios') x ORDER BY 1 LOOP
  IF NOT coalesce(public.mimo_rep_uf_valida(v_uf),false) THEN RAISE EXCEPTION 'UF invalida: %',v_uf; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_dados->'territorios') x WHERE x->>'uf'=v_uf AND (x->>'principal')::boolean)>1 THEN RAISE EXCEPTION 'UF % com mais de um principal',v_uf; END IF;
  ids := ARRAY[]::uuid[]; principal_rep := NULL;
  FOR e IN SELECT x FROM jsonb_array_elements(_dados->'territorios') x WHERE x->>'uf'=v_uf LOOP
   SELECT id INTO v_rep FROM public.mimo_rep_comerciais WHERE empresa_id=_empresa AND chave=public.mimo_rep_chave(e->>'nome');
   IF NOT FOUND THEN RAISE EXCEPTION 'Representante sem cadastro na importacao: %',e->>'nome'; END IF;
   IF v_rep=ANY(ids) THEN RAISE EXCEPTION 'Territorio repetido: %',v_uf; END IF;
   ids := ids||v_rep;
   IF (e->>'principal')::boolean THEN principal_rep := v_rep; END IF;
  END LOOP;
  FOR t IN SELECT * FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND uf=v_uf AND representante_id<>ALL(ids) ORDER BY representante_id FOR UPDATE LOOP
   DELETE FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND uf=v_uf AND representante_id=t.representante_id;
   INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id) VALUES(_empresa,'territorio',v_uf,'importar_remover',to_jsonb(t),NULL,ator);
   territorios := territorios+1;
  END LOOP;
  -- Libera o principal antigo antes de gravar o novo (indice unico parcial), guardando quem era.
  antigo_principal := NULL;
  SELECT representante_id INTO antigo_principal FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND uf=v_uf AND principal;
  UPDATE public.mimo_rep_comerciais_territorios SET principal=false,updated_at=clock_timestamp()
   WHERE empresa_id=_empresa AND uf=v_uf AND principal AND representante_id IS DISTINCT FROM principal_rep;
  FOR e IN SELECT x FROM jsonb_array_elements(_dados->'territorios') x WHERE x->>'uf'=v_uf LOOP
   SELECT id INTO v_rep FROM public.mimo_rep_comerciais WHERE empresa_id=_empresa AND chave=public.mimo_rep_chave(e->>'nome');
   v_principal := coalesce((e->>'principal')::boolean,false);
   v_regiao := left(btrim(coalesce(e->>'regiao','')),100);
   v_estado := left(btrim(coalesce(e->>'estado','')),100);
   SELECT * INTO t FROM public.mimo_rep_comerciais_territorios WHERE empresa_id=_empresa AND uf=v_uf AND representante_id=v_rep FOR UPDATE;
   IF NOT FOUND THEN
    INSERT INTO public.mimo_rep_comerciais_territorios(empresa_id,uf,representante_id,principal,regiao,estado) VALUES(_empresa,v_uf,v_rep,v_principal,v_regiao,v_estado);
    INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id)
     VALUES(_empresa,'territorio',v_uf,'importar_adicionar',NULL,jsonb_build_object('representante_id',v_rep,'principal',v_principal,'regiao',v_regiao,'estado',v_estado),ator);
    territorios := territorios+1;
   ELSE
    -- t foi lido apos liberar o principal antigo; compara com o valor anterior real.
    v_antes_principal := t.representante_id IS NOT DISTINCT FROM antigo_principal;
    IF v_antes_principal<>v_principal OR t.principal<>v_principal OR t.regiao<>v_regiao OR t.estado<>v_estado THEN
     UPDATE public.mimo_rep_comerciais_territorios SET principal=v_principal,regiao=v_regiao,estado=v_estado,updated_at=clock_timestamp() WHERE empresa_id=_empresa AND uf=v_uf AND representante_id=v_rep;
     INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id)
      VALUES(_empresa,'territorio',v_uf,'importar_editar',to_jsonb(t)||jsonb_build_object('principal',v_antes_principal),jsonb_build_object('representante_id',v_rep,'principal',v_principal,'regiao',v_regiao,'estado',v_estado),ator);
     territorios := territorios+1;
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id)
  VALUES(_empresa,'importacao',_dados->>'hash','importar',NULL,jsonb_build_object('criados',criados,'atualizados',atualizados,'inalterados',inalterados,'territorios',territorios),ator);
 RETURN jsonb_build_object('criados',criados,'atualizados',atualizados,'inalterados',inalterados,'territorios',territorios);
END $$;

-- Atribuicao manual de uma unidade da carteira (vence a regra da UF). Nulo devolve ao automatico.
CREATE FUNCTION public.mimo_rep_comercial_cliente(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ator uuid; c public.mimo_rep_comerciais_clientes; antes jsonb;
 v_unidade uuid := (_dados->>'unidade_id')::uuid;
 v_rep uuid := nullif(_dados->>'representante_id','')::uuid;
 v_motivo text := btrim(coalesce(_dados->>'motivo',''));
 v_versao integer := nullif(_dados->>'versao','')::integer;
BEGIN
 ator := public.mimo_rep_exigir_gestao(_empresa);
 IF length(v_motivo) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Informe o motivo da alteracao'; END IF;
 PERFORM 1 FROM public.mimo_carteira_unidades WHERE empresa_id=_empresa AND id=v_unidade FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unidade indisponivel'; END IF;
 IF v_rep IS NOT NULL THEN
  PERFORM 1 FROM public.mimo_rep_comerciais WHERE empresa_id=_empresa AND id=v_rep AND ativo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Representante indisponivel ou inativo'; END IF;
 END IF;
 SELECT * INTO c FROM public.mimo_rep_comerciais_clientes WHERE empresa_id=_empresa AND unidade_id=v_unidade FOR UPDATE;
 IF NOT FOUND THEN
  IF v_versao IS NOT NULL THEN RAISE EXCEPTION 'Atribuicao alterada por outra pessoa; reabra antes de salvar'; END IF;
  IF v_rep IS NULL THEN RAISE EXCEPTION 'O cliente ja segue o representante da UF'; END IF;
  INSERT INTO public.mimo_rep_comerciais_clientes(empresa_id,unidade_id,representante_id,motivo,atualizado_por) VALUES(_empresa,v_unidade,v_rep,v_motivo,ator) RETURNING * INTO c;
  antes := NULL;
 ELSE
  IF c.versao IS DISTINCT FROM v_versao THEN RAISE EXCEPTION 'Atribuicao alterada por outra pessoa; reabra antes de salvar'; END IF;
  antes := to_jsonb(c);
  UPDATE public.mimo_rep_comerciais_clientes SET representante_id=v_rep,motivo=v_motivo,versao=versao+1,atualizado_por=ator,updated_at=clock_timestamp()
   WHERE empresa_id=_empresa AND unidade_id=v_unidade RETURNING * INTO c;
 END IF;
 INSERT INTO public.mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,antes,depois,ator_id)
  VALUES(_empresa,'cliente',v_unidade::text,CASE WHEN v_rep IS NULL THEN 'voltar_automatico' ELSE 'atribuir' END,antes,to_jsonb(c),ator);
 RETURN to_jsonb(c);
END $$;

REVOKE ALL ON FUNCTION public.mimo_rep_comercial_salvar(uuid,jsonb),public.mimo_rep_comerciais_importar(uuid,jsonb),public.mimo_rep_comercial_cliente(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_rep_comercial_salvar(uuid,jsonb),public.mimo_rep_comerciais_importar(uuid,jsonb),public.mimo_rep_comercial_cliente(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.mimo_rep_uf_valida(text),public.mimo_rep_chave(text) FROM anon;
COMMIT;
