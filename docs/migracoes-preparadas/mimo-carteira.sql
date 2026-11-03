-- PREPARADO. Aplicar somente após backup confirmado e validação isolada.
BEGIN;
CREATE FUNCTION public.mimo_carteira_cnpj_valido(valor text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE base text; tamanho integer; soma integer; peso integer; resto integer; i integer;
BEGIN
 IF valor !~ '^[0-9]{14}$' OR valor ~ '^([0-9])\1+$' THEN RETURN false; END IF;
 FOR tamanho IN 12..13 LOOP
 base=left(valor,tamanho);soma=0;peso=tamanho-7;
 FOR i IN 1..tamanho LOOP soma=soma+substr(base,i,1)::integer*peso;peso=peso-1;IF peso=1 THEN peso=9;END IF;END LOOP;
 resto=soma%11;IF substr(valor,tamanho+1,1)::integer<>(CASE WHEN resto<2 THEN 0 ELSE 11-resto END) THEN RETURN false;END IF;
 END LOOP;RETURN true;
END $$;
CREATE TABLE public.mimo_carteira_unidades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome text NOT NULL CHECK(length(trim(nome)) BETWEEN 2 AND 200), cnpj text NOT NULL DEFAULT '' CHECK(cnpj='' OR public.mimo_carteira_cnpj_valido(cnpj)),
 rede text NOT NULL DEFAULT '', grupo text NOT NULL DEFAULT '', razao_social text NOT NULL DEFAULT '',
 canal text NOT NULL DEFAULT '',cidade text NOT NULL DEFAULT '',uf text NOT NULL DEFAULT '',instagram text NOT NULL DEFAULT '',
 classe text NOT NULL DEFAULT '' CHECK(classe IN ('','A','B','C')),
 situacao text NOT NULL DEFAULT 'Não abordado' CHECK(situacao IN ('Não abordado','Em contato','Em negociação','Cliente','Sem interesse')),
 responsavel_id uuid REFERENCES auth.users(id),observacoes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(empresa_id,id),CHECK(length(rede)<=200 AND length(grupo)<=200 AND length(razao_social)<=200 AND length(canal)<=100 AND length(cidade)<=150 AND length(uf)<=2 AND length(instagram)<=200 AND length(observacoes)<=10000)
);
CREATE INDEX ON public.mimo_carteira_unidades(empresa_id,responsavel_id,nome,id);
CREATE INDEX ON public.mimo_carteira_unidades(empresa_id,nome,id);
CREATE UNIQUE INDEX ON public.mimo_carteira_unidades(empresa_id,cnpj) WHERE cnpj <> '';
CREATE TABLE public.mimo_carteira_atividades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL,unidade_id uuid NOT NULL,
 tipo text NOT NULL CHECK(tipo IN ('Ligação','WhatsApp','E-mail','Tarefa')),prazo timestamptz NOT NULL,
 descricao text NOT NULL CHECK(length(descricao) BETWEEN 1 AND 2000),concluida_em timestamptz,resultado text NOT NULL DEFAULT '',
 autor_id uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(empresa_id,unidade_id) REFERENCES public.mimo_carteira_unidades(empresa_id,id)
);
CREATE INDEX ON public.mimo_carteira_atividades(empresa_id,unidade_id,prazo);
CREATE INDEX ON public.mimo_carteira_atividades(empresa_id,unidade_id,prazo) WHERE concluida_em IS NULL;
CREATE INDEX ON public.mimo_carteira_atividades(empresa_id,unidade_id,concluida_em DESC) WHERE concluida_em IS NOT NULL;
CREATE TABLE public.mimo_carteira_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL,unidade_id uuid NOT NULL,
 ator_id uuid NOT NULL,acao text NOT NULL DEFAULT 'unidade',antes jsonb,depois jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(empresa_id,unidade_id) REFERENCES public.mimo_carteira_unidades(empresa_id,id)
);
ALTER TABLE public.mimo_carteira_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_carteira_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_carteira_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_carteira_unidades,public.mimo_carteira_atividades,public.mimo_carteira_historico FROM anon,authenticated;
GRANT SELECT ON public.mimo_carteira_unidades,public.mimo_carteira_atividades,public.mimo_carteira_historico TO authenticated;
-- Escopo do próprio chamador calculado uma vez por consulta (InitPlans), não por unidade.
CREATE FUNCTION public.mimo_carteira_contexto_leitura() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('empresa_id',e.id,'gestao',m.papel::text IN ('administrador','gestor'),'vendedor',m.papel::text='vendedor')
 FROM public.empresas e JOIN public.empresa_membros m ON m.empresa_id=e.id
 WHERE e.slug='mimo' AND e.ativa AND m.user_id=auth.uid() AND m.ativo
$$;
REVOKE ALL ON FUNCTION public.mimo_carteira_contexto_leitura() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_carteira_contexto_leitura() TO authenticated;
CREATE POLICY carteira_read ON public.mimo_carteira_unidades FOR SELECT TO authenticated USING (
 empresa_id=(SELECT (public.mimo_carteira_contexto_leitura()->>'empresa_id')::uuid) AND
 ((SELECT (public.mimo_carteira_contexto_leitura()->>'gestao')::boolean) OR
 (responsavel_id=(SELECT auth.uid()) AND (SELECT (public.mimo_carteira_contexto_leitura()->>'vendedor')::boolean))));
CREATE POLICY carteira_atividade_read ON public.mimo_carteira_atividades FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.mimo_carteira_unidades u WHERE u.id=unidade_id AND u.empresa_id=mimo_carteira_atividades.empresa_id));
CREATE POLICY carteira_historico_read ON public.mimo_carteira_historico FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.mimo_carteira_unidades u WHERE u.id=unidade_id AND u.empresa_id=mimo_carteira_historico.empresa_id));
CREATE FUNCTION public.mimo_carteira_gravar(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.empresa_membros; anterior public.mimo_carteira_unidades; novo public.mimo_carteira_unidades; uid uuid=auth.uid(); gestor boolean; alvo uuid;
BEGIN
 PERFORM public.mimo_carteira_papel(_empresa);
 SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=uid AND ativo FOR SHARE;
 IF NOT FOUND OR m.papel::text NOT IN ('administrador','gestor','vendedor') OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 gestor=m.papel::text IN ('administrador','gestor');
 IF nullif(_dados->>'id','') IS NOT NULL THEN
 SELECT * INTO anterior FROM public.mimo_carteira_unidades WHERE id=(_dados->>'id')::uuid AND empresa_id=_empresa FOR UPDATE;
 IF NOT FOUND OR (NOT gestor AND anterior.responsavel_id IS DISTINCT FROM uid) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF anterior.updated_at IS DISTINCT FROM (_dados->>'updated_at')::timestamptz THEN RAISE EXCEPTION 'Registro alterado; reabra a ficha'; END IF;
 END IF;
 alvo=nullif(_dados->>'responsavel_id','')::uuid;
 IF NOT gestor THEN alvo=uid; END IF;
 IF alvo IS NOT NULL THEN
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=alvo AND ativo AND papel::text IN ('administrador','gestor','vendedor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
 END IF;
 novo=jsonb_populate_record(NULL::public.mimo_carteira_unidades,_dados);
 IF novo.cnpj<>'' AND novo.cnpj !~ '^[0-9]{14}$' THEN RAISE EXCEPTION 'CNPJ deve conter 14 dígitos'; END IF;
 IF anterior.id IS NULL THEN
 INSERT INTO public.mimo_carteira_unidades(empresa_id,nome,cnpj,rede,grupo,razao_social,canal,cidade,uf,instagram,classe,situacao,responsavel_id,observacoes)
 VALUES(_empresa,novo.nome,novo.cnpj,novo.rede,novo.grupo,novo.razao_social,novo.canal,novo.cidade,novo.uf,novo.instagram,novo.classe,novo.situacao,alvo,novo.observacoes) RETURNING * INTO novo;
 ELSE
 UPDATE public.mimo_carteira_unidades SET nome=novo.nome,cnpj=novo.cnpj,rede=novo.rede,grupo=novo.grupo,razao_social=novo.razao_social,canal=novo.canal,cidade=novo.cidade,uf=novo.uf,instagram=novo.instagram,classe=novo.classe,situacao=novo.situacao,responsavel_id=alvo,observacoes=novo.observacoes,updated_at=clock_timestamp() WHERE id=anterior.id RETURNING * INTO novo;
 END IF;
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,antes,depois) VALUES(_empresa,novo.id,uid,to_jsonb(anterior),to_jsonb(novo));
 RETURN to_jsonb(novo);
END $$;
CREATE FUNCTION public.mimo_carteira_atividade(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.empresa_membros; u public.mimo_carteira_unidades; a public.mimo_carteira_atividades;
BEGIN
 PERFORM public.mimo_carteira_papel(_empresa);
 SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=auth.uid() AND ativo FOR SHARE;
 IF NOT FOUND OR m.papel::text NOT IN ('administrador','gestor','vendedor') OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT * INTO u FROM public.mimo_carteira_unidades WHERE empresa_id=_empresa AND id=(_dados->>'unidade_id')::uuid FOR SHARE;
 IF NOT FOUND OR (m.papel::text='vendedor' AND u.responsavel_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF nullif(_dados->>'id','') IS NOT NULL THEN
 IF _dados->>'operacao'='reagendar' THEN
 UPDATE public.mimo_carteira_atividades SET prazo=(_dados->>'prazo')::timestamptz WHERE id=(_dados->>'id')::uuid AND unidade_id=u.id AND empresa_id=_empresa AND concluida_em IS NULL RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atividade indisponível'; END IF;
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,acao,depois) VALUES(_empresa,u.id,auth.uid(),'reagendamento',to_jsonb(a));
 RETURN to_jsonb(a);
 END IF;
 IF length(trim(coalesce(_dados->>'resultado',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Informe o resultado'; END IF;
 UPDATE public.mimo_carteira_atividades SET concluida_em=clock_timestamp(),resultado=_dados->>'resultado' WHERE id=(_dados->>'id')::uuid AND unidade_id=u.id AND empresa_id=_empresa AND concluida_em IS NULL RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atividade alterada ou indisponível'; END IF;
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,acao,depois) VALUES(_empresa,u.id,auth.uid(),'atividade',to_jsonb(a));
 RETURN to_jsonb(a);
 END IF;
 INSERT INTO public.mimo_carteira_atividades(empresa_id,unidade_id,tipo,prazo,descricao,autor_id) VALUES(_empresa,u.id,_dados->>'tipo',(_dados->>'prazo')::timestamptz,_dados->>'descricao',auth.uid()) RETURNING * INTO a;
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,acao,depois) VALUES(_empresa,u.id,auth.uid(),'atividade',to_jsonb(a));
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.mimo_carteira_gravar(uuid,jsonb),public.mimo_carteira_atividade(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_carteira_gravar(uuid,jsonb),public.mimo_carteira_atividade(uuid,jsonb) TO authenticated;


-- Toda autorização das operações abaixo é repetida no banco, com vínculo travado.
CREATE FUNCTION public.mimo_carteira_papel(_empresa uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE papel text;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT m.papel::text INTO papel FROM public.empresa_membros m WHERE m.empresa_id=_empresa AND user_id=auth.uid() AND ativo FOR SHARE;
 IF papel IS NULL OR papel NOT IN ('administrador','gestor','vendedor') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN papel;
END $$;
CREATE FUNCTION public.mimo_carteira_exigir_unidade(_empresa uuid,_unidade uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE papel text; u public.mimo_carteira_unidades;
BEGIN
 papel=public.mimo_carteira_papel(_empresa);
 SELECT * INTO u FROM public.mimo_carteira_unidades WHERE empresa_id=_empresa AND id=_unidade FOR SHARE;
 IF NOT FOUND OR (papel='vendedor' AND u.responsavel_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Unidade indisponível'; END IF;
END $$;

CREATE TABLE public.mimo_carteira_contatos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome text NOT NULL DEFAULT '' CHECK(length(nome)<=200), telefone text NOT NULL DEFAULT '' CHECK(length(telefone)<=100),
 whatsapp text NOT NULL DEFAULT '' CHECK(length(whatsapp)<=100), email text NOT NULL DEFAULT '' CHECK(length(email)<=254),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(empresa_id,id),
 CHECK(length(trim(nome||telefone||whatsapp||email))>0)
);
CREATE TABLE public.mimo_carteira_contato_unidades (
 empresa_id uuid NOT NULL,unidade_id uuid NOT NULL,contato_id uuid NOT NULL,
 papel text NOT NULL CHECK(papel IN ('Proprietário','Comprador','Outro')),
 PRIMARY KEY(unidade_id,contato_id),
 FOREIGN KEY(empresa_id,unidade_id) REFERENCES public.mimo_carteira_unidades(empresa_id,id),
 FOREIGN KEY(empresa_id,contato_id) REFERENCES public.mimo_carteira_contatos(empresa_id,id)
);
CREATE INDEX ON public.mimo_carteira_contato_unidades(empresa_id,contato_id);
CREATE TABLE public.mimo_carteira_negociacoes (
 empresa_id uuid NOT NULL,unidade_id uuid NOT NULL,lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(unidade_id,lead_id),
 FOREIGN KEY(empresa_id,unidade_id) REFERENCES public.mimo_carteira_unidades(empresa_id,id)
);
CREATE INDEX ON public.mimo_carteira_negociacoes(empresa_id,lead_id);
CREATE TABLE public.mimo_carteira_importacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),plano_hash text NOT NULL,total integer NOT NULL CHECK(total BETWEEN 1 AND 10000),
 criados integer NOT NULL DEFAULT 0,ignorados integer NOT NULL DEFAULT 0,processados integer NOT NULL DEFAULT 0,
 autor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),concluida_em timestamptz,UNIQUE(empresa_id,hash,plano_hash)
);
CREATE TABLE public.mimo_carteira_importacao_linhas (
 importacao_id uuid NOT NULL REFERENCES public.mimo_carteira_importacoes(id),linha integer NOT NULL,
 payload jsonb NOT NULL,unidade_id uuid REFERENCES public.mimo_carteira_unidades(id),resultado text NOT NULL,
 PRIMARY KEY(importacao_id,linha)
);
ALTER TABLE public.mimo_carteira_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_carteira_contato_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_carteira_negociacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_carteira_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_carteira_importacao_linhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_carteira_contatos,public.mimo_carteira_contato_unidades,public.mimo_carteira_negociacoes,public.mimo_carteira_importacoes,public.mimo_carteira_importacao_linhas FROM anon,authenticated;
GRANT SELECT ON public.mimo_carteira_contatos,public.mimo_carteira_contato_unidades,public.mimo_carteira_negociacoes,public.mimo_carteira_importacoes,public.mimo_carteira_importacao_linhas TO authenticated;
CREATE POLICY contato_vinculo_read ON public.mimo_carteira_contato_unidades FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mimo_carteira_unidades u WHERE u.id=unidade_id AND u.empresa_id=mimo_carteira_contato_unidades.empresa_id));
CREATE POLICY contato_read ON public.mimo_carteira_contatos FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mimo_carteira_contato_unidades v WHERE v.contato_id=id AND v.empresa_id=mimo_carteira_contatos.empresa_id));
CREATE POLICY negociacao_read ON public.mimo_carteira_negociacoes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mimo_carteira_unidades u WHERE u.id=unidade_id AND u.empresa_id=mimo_carteira_negociacoes.empresa_id) AND public.pode_ver_mimo_lead(lead_id,auth.uid()));
CREATE POLICY importacao_read ON public.mimo_carteira_importacoes FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE POLICY importacao_linha_read ON public.mimo_carteira_importacao_linhas FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mimo_carteira_importacoes i WHERE i.id=importacao_id));
CREATE INDEX ON public.mimo_carteira_atividades(empresa_id,prazo) WHERE concluida_em IS NULL;
CREATE INDEX ON public.mimo_carteira_unidades(empresa_id,rede,grupo,uf,cidade);
CREATE INDEX ON public.mimo_carteira_historico(empresa_id,unidade_id,created_at DESC,id);
CREATE VIEW public.mimo_carteira_lista WITH(security_invoker=true) AS
SELECT u.*,
 (SELECT min(a.prazo) FROM public.mimo_carteira_atividades a WHERE a.unidade_id=u.id AND a.empresa_id=u.empresa_id AND a.concluida_em IS NULL) AS proxima_acao,
 (SELECT max(a.concluida_em) FROM public.mimo_carteira_atividades a WHERE a.unidade_id=u.id AND a.empresa_id=u.empresa_id) AS ultimo_contato
FROM public.mimo_carteira_unidades u;
GRANT SELECT ON public.mimo_carteira_lista TO authenticated;

CREATE FUNCTION public.mimo_carteira_contato(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE papel text; c public.mimo_carteira_contatos; antes jsonb; u uuid; vinculo record;
BEGIN
 papel=public.mimo_carteira_papel(_empresa);u=(_dados->>'unidade_id')::uuid;
 PERFORM public.mimo_carteira_exigir_unidade(_empresa,u);
 IF nullif(_dados->>'id','') IS NOT NULL THEN
 SELECT * INTO c FROM public.mimo_carteira_contatos WHERE empresa_id=_empresa AND id=(_dados->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contato indisponível'; END IF;
 IF _dados->>'operacao'='associar' THEN
 IF papel='vendedor' THEN RAISE EXCEPTION 'Somente gestão associa contatos compartilhados'; END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.mimo_carteira_contato_unidades WHERE unidade_id=u AND contato_id=c.id) THEN RAISE EXCEPTION 'Contato indisponível'; END IF;
 IF c.updated_at IS DISTINCT FROM (_dados->>'updated_at')::timestamptz THEN RAISE EXCEPTION 'Contato alterado; reabra a ficha'; END IF;
 -- Um vendedor não pode editar um contato compartilhado que afete carteiras alheias.
 FOR vinculo IN SELECT unidade_id FROM public.mimo_carteira_contato_unidades WHERE contato_id=c.id ORDER BY unidade_id LOOP
 PERFORM public.mimo_carteira_exigir_unidade(_empresa,vinculo.unidade_id);
 END LOOP;
 antes=to_jsonb(c);
 UPDATE public.mimo_carteira_contatos SET nome=coalesce(_dados->>'nome',''),telefone=coalesce(_dados->>'telefone',''),whatsapp=coalesce(_dados->>'whatsapp',''),email=coalesce(_dados->>'email',''),updated_at=clock_timestamp() WHERE id=c.id RETURNING * INTO c;
 END IF;
 ELSE
 INSERT INTO public.mimo_carteira_contatos(empresa_id,nome,telefone,whatsapp,email) VALUES(_empresa,coalesce(_dados->>'nome',''),coalesce(_dados->>'telefone',''),coalesce(_dados->>'whatsapp',''),coalesce(_dados->>'email','')) RETURNING * INTO c;
 END IF;
 INSERT INTO public.mimo_carteira_contato_unidades(empresa_id,unidade_id,contato_id,papel) VALUES(_empresa,u,c.id,coalesce(_dados->>'papel','Outro')) ON CONFLICT(unidade_id,contato_id) DO UPDATE SET papel=excluded.papel;
 -- Auditar em todas as unidades afetadas sem expor vínculos invisíveis ao vendedor.
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,acao,antes,depois)
 SELECT _empresa,v.unidade_id,auth.uid(),'contato',antes,to_jsonb(c) FROM public.mimo_carteira_contato_unidades v WHERE v.contato_id=c.id;
 RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.mimo_carteira_atribuir(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; alvo uuid; u public.mimo_carteira_unidades; contador integer=0;
BEGIN
 IF public.mimo_carteira_papel(_empresa)='vendedor' THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(_dados->'ids');
 IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Selecione até 100 unidades'; END IF;
 alvo=nullif(_dados->>'responsavel_id','')::uuid;
 IF alvo IS NOT NULL THEN
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=alvo AND ativo AND papel::text IN ('administrador','gestor','vendedor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
 END IF;
 FOR u IN SELECT * FROM public.mimo_carteira_unidades WHERE empresa_id=_empresa AND id=ANY(ids) ORDER BY id FOR UPDATE LOOP
 UPDATE public.mimo_carteira_unidades SET responsavel_id=alvo,updated_at=clock_timestamp() WHERE id=u.id;
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,acao,antes,depois) VALUES(_empresa,u.id,auth.uid(),'responsavel',jsonb_build_object('responsavel_id',u.responsavel_id),jsonb_build_object('responsavel_id',alvo));
 contador=contador+1;
 END LOOP;
 IF contador<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Unidade indisponível'; END IF;
 RETURN jsonb_build_object('alterados',contador);
END $$;

CREATE TABLE public.mimo_carteira_negociacao_operacoes (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),operacao_id uuid NOT NULL,ator_id uuid NOT NULL,payload jsonb NOT NULL,lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),PRIMARY KEY(empresa_id,operacao_id)
);
ALTER TABLE public.mimo_carteira_negociacao_operacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_carteira_negociacao_operacoes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.mimo_carteira_negociar(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; unidade uuid; principal public.mimo_carteira_unidades; lead public.mimo_leads; papel text; anterior public.mimo_carteira_negociacao_operacoes;
BEGIN
 papel=public.mimo_carteira_papel(_empresa);
 SELECT array_agg(value::uuid ORDER BY value) INTO ids FROM jsonb_array_elements_text(_dados->'unidades');
 IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Selecione até 100 unidades'; END IF;
 FOREACH unidade IN ARRAY ids LOOP PERFORM public.mimo_carteira_exigir_unidade(_empresa,unidade); END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text||(_dados->>'operacao_id'),0));
 SELECT * INTO anterior FROM public.mimo_carteira_negociacao_operacoes WHERE empresa_id=_empresa AND operacao_id=(_dados->>'operacao_id')::uuid;
 IF FOUND THEN
 IF anterior.ator_id<>auth.uid() OR anterior.payload IS DISTINCT FROM _dados THEN RAISE EXCEPTION 'Operação já utilizada'; END IF;
 IF NOT public.pode_ver_mimo_lead(anterior.lead_id,auth.uid()) THEN RAISE EXCEPTION 'Lead indisponível'; END IF;
 RETURN jsonb_build_object('lead_id',anterior.lead_id);
 END IF;
 IF nullif(_dados->>'lead_id','') IS NOT NULL THEN
 SELECT * INTO lead FROM public.mimo_leads WHERE empresa_id=_empresa AND id=(_dados->>'lead_id')::uuid FOR SHARE;
 IF NOT FOUND OR (papel='vendedor' AND lead.responsavel_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Lead indisponível'; END IF;
 ELSE
 SELECT * INTO principal FROM public.mimo_carteira_unidades WHERE empresa_id=_empresa AND id=(_dados->>'principal')::uuid;
 IF NOT FOUND OR NOT principal.id=ANY(ids) THEN RAISE EXCEPTION 'Unidade principal inválida'; END IF;
 -- O lead comercial nasce agora. Nenhum valor histórico é convertido em receita.
 INSERT INTO public.mimo_leads(empresa_id,nome_empresa,responsavel_id,origem,etapa,created_by,observacoes)
 VALUES(_empresa,principal.nome,CASE WHEN papel='vendedor' THEN auth.uid() ELSE principal.responsavel_id END,'outra','em_negociacao',auth.uid(),'Prospecção pela carteira MiMo') RETURNING * INTO lead;
 END IF;
 FOREACH unidade IN ARRAY ids LOOP
 INSERT INTO public.mimo_carteira_negociacoes(empresa_id,unidade_id,lead_id) VALUES(_empresa,unidade,lead.id) ON CONFLICT DO NOTHING;
 INSERT INTO public.mimo_carteira_historico(empresa_id,unidade_id,ator_id,acao,depois) VALUES(_empresa,unidade,auth.uid(),'negociacao',jsonb_build_object('lead_id',lead.id));
 END LOOP;
 INSERT INTO public.mimo_carteira_negociacao_operacoes(empresa_id,operacao_id,ator_id,payload,lead_id) VALUES(_empresa,(_dados->>'operacao_id')::uuid,auth.uid(),_dados,lead.id);
 RETURN jsonb_build_object('lead_id',lead.id);
END $$;

CREATE FUNCTION public.mimo_carteira_importar(_empresa uuid,_dados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job public.mimo_carteira_importacoes; item jsonb; old_payload jsonb; doc jsonb; contato jsonb; unidade uuid; resultado text; novos integer=0; pulados integer=0; n integer=0;
BEGIN
 IF public.mimo_carteira_papel(_empresa)='vendedor' THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('carteira_importar'||_empresa::text,0));
 IF jsonb_array_length(_dados->'linhas') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 INSERT INTO public.mimo_carteira_importacoes(empresa_id,hash,plano_hash,total,autor_id) VALUES(_empresa,_dados->>'hash',_dados->>'plano_hash',(_dados->>'total')::integer,auth.uid()) ON CONFLICT(empresa_id,hash,plano_hash) DO NOTHING;
 SELECT * INTO job FROM public.mimo_carteira_importacoes WHERE empresa_id=_empresa AND hash=_dados->>'hash' AND plano_hash=_dados->>'plano_hash' FOR UPDATE;
 IF job.total<>(_dados->>'total')::integer THEN RAISE EXCEPTION 'Revisão de importação inconsistente.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_dados->'linhas') LOOP
 IF (item->>'linha')::integer NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Linha inválida'; END IF;
 SELECT payload INTO old_payload FROM public.mimo_carteira_importacao_linhas WHERE importacao_id=job.id AND linha=(item->>'linha')::integer;
 IF FOUND THEN
 IF old_payload IS DISTINCT FROM item THEN RAISE EXCEPTION 'Linha já processada com conteúdo diferente'; END IF;
 CONTINUE;
 END IF;
 IF job.concluida_em IS NOT NULL THEN RAISE EXCEPTION 'Arquivo já importado'; END IF;
 doc=(item->'unidade')-'id'-'updated_at';unidade=NULL;
 -- CNPJ coincidente é conflito; ausência de CNPJ usa nome+cidade+UF como alerta conservador.
 SELECT id INTO unidade FROM public.mimo_carteira_unidades WHERE empresa_id=_empresa AND
 ((coalesce(doc->>'cnpj','')<>'' AND cnpj=doc->>'cnpj') OR (coalesce(doc->>'cnpj','')='' AND lower(trim(nome))=lower(trim(doc->>'nome')) AND lower(trim(cidade))=lower(trim(doc->>'cidade')) AND uf=doc->>'uf')) LIMIT 1;
 IF unidade IS NOT NULL THEN resultado='existente: revisar vínculo';pulados=pulados+1;
 ELSE
 doc=public.mimo_carteira_gravar(_empresa,doc);unidade=(doc->>'id')::uuid;
 FOR contato IN SELECT value FROM jsonb_array_elements(coalesce(item->'contatos','[]'::jsonb)) LOOP
 PERFORM public.mimo_carteira_contato(_empresa,(contato-'id'-'updated_at')||jsonb_build_object('unidade_id',unidade));
 END LOOP;
 resultado='criado';novos=novos+1;
 END IF;
 INSERT INTO public.mimo_carteira_importacao_linhas(importacao_id,linha,payload,unidade_id,resultado) VALUES(job.id,(item->>'linha')::integer,item,unidade,resultado);n=n+1;
 END LOOP;
 IF job.processados+n>job.total THEN RAISE EXCEPTION 'Quantidade de linhas excedida'; END IF;
 UPDATE public.mimo_carteira_importacoes SET processados=processados+n,criados=mimo_carteira_importacoes.criados+novos,ignorados=mimo_carteira_importacoes.ignorados+pulados,concluida_em=CASE WHEN processados+n=total THEN now() ELSE NULL END WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job);
END $$;

REVOKE ALL ON FUNCTION public.mimo_carteira_papel(uuid),public.mimo_carteira_exigir_unidade(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mimo_carteira_contato(uuid,jsonb),public.mimo_carteira_atribuir(uuid,jsonb),public.mimo_carteira_negociar(uuid,jsonb),public.mimo_carteira_importar(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_carteira_contato(uuid,jsonb),public.mimo_carteira_atribuir(uuid,jsonb),public.mimo_carteira_negociar(uuid,jsonb),public.mimo_carteira_importar(uuid,jsonb) TO authenticated;
COMMIT;
