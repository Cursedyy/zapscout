-- Prepared migration. ASCII identifiers and enum values prevent encoding drift.
CREATE TABLE public.mimo_representantes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome text NOT NULL CHECK(length(trim(nome)) BETWEEN 3 AND 150),
 email text NOT NULL CHECK(length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 whatsapp text NOT NULL CHECK(whatsapp ~ '^[1-9]{2}[0-9]{8,9}$'),
 cidade text NOT NULL CHECK(length(trim(cidade)) BETWEEN 2 AND 100),
 uf text NOT NULL CHECK(uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 regiao_atuacao text NOT NULL CHECK(length(trim(regiao_atuacao)) BETWEEN 2 AND 500),
 experiencia text NOT NULL CHECK(experiencia IN ('sem','ate1','1a3','mais3')),
 segmentos text[] NOT NULL CHECK(cardinality(segmentos) BETWEEN 1 AND 6 AND array_position(segmentos,NULL) IS NULL AND segmentos <@ ARRAY['alimentos_saudaveis','suplementos','produtos_naturais','farmacias','supermercados','outros']::text[]),
 carteira_clientes integer NOT NULL CHECK(carteira_clientes BETWEEN 0 AND 10000000),
 marcas_atuais text NOT NULL DEFAULT '' CHECK(length(marcas_atuais)<=1000),
 core text NOT NULL CHECK(core IN ('ativo','em_andamento','nao')),
 disponibilidade text NOT NULL CHECK(disponibilidade IN ('imediata','15_dias','30_dias','a_combinar')),
 consentimento boolean NOT NULL CHECK(consentimento),aviso_versao text NOT NULL DEFAULT '2026-11-v1',
 etapa text NOT NULL DEFAULT 'Novo' CHECK(etapa IN ('Novo',U&'Em an\00E1lise',U&'Pr\00E9-selecionado','Contatado','Aprovado','Confirmado',U&'N\00E3o selecionado','Desistiu')),
 notas text NOT NULL DEFAULT '' CHECK(length(notas)<=5000),versao integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 excluido_em timestamptz,excluido_por uuid,
 UNIQUE(empresa_id,email),UNIQUE(empresa_id,whatsapp)
);
CREATE INDEX ON public.mimo_representantes(empresa_id,created_at DESC,id) WHERE excluido_em IS NULL;
CREATE TABLE public.mimo_representantes_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 representante_id uuid NOT NULL REFERENCES public.mimo_representantes(id),etapa text NOT NULL,
 notas text NOT NULL,acao text NOT NULL,ator_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.mimo_representantes_historico(empresa_id,representante_id,created_at DESC);
CREATE TABLE public.mimo_representantes_limites(ip_hash text NOT NULL,janela timestamptz NOT NULL,tentativas integer NOT NULL,PRIMARY KEY(ip_hash,janela));
ALTER TABLE public.mimo_representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_representantes_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_representantes_limites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_representantes,public.mimo_representantes_historico,public.mimo_representantes_limites FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mimo_representantes,public.mimo_representantes_historico TO authenticated;
GRANT UPDATE(etapa,notas) ON public.mimo_representantes TO authenticated;
GRANT ALL ON public.mimo_representantes,public.mimo_representantes_historico,public.mimo_representantes_limites TO service_role;
CREATE POLICY representantes_ler ON public.mimo_representantes FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
CREATE POLICY representantes_avaliar ON public.mimo_representantes FOR UPDATE TO authenticated USING (
 excluido_em IS NULL AND public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)) WITH CHECK (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
CREATE POLICY representantes_historico_ler ON public.mimo_representantes_historico FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));

CREATE FUNCTION public.mimo_representante_normalizar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.email=lower(trim(NEW.email));NEW.whatsapp=public.mimo_influenciador_telefone(NEW.whatsapp);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_representante_normalizar() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mimo_representante_normalizar_identidade BEFORE INSERT OR UPDATE OF email,whatsapp ON public.mimo_representantes FOR EACH ROW EXECUTE FUNCTION public.mimo_representante_normalizar();

CREATE FUNCTION public.mimo_representante_auditar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id THEN RAISE EXCEPTION 'Immutable identity'; END IF;
  NEW.versao=OLD.versao+1;NEW.updated_at=clock_timestamp();NEW.created_at=OLD.created_at;
 END IF;
 INSERT INTO public.mimo_representantes_historico(empresa_id,representante_id,etapa,notas,ator_id,acao)
 VALUES(NEW.empresa_id,NEW.id,NEW.etapa,NEW.notas,auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'cadastro' WHEN NEW.excluido_em IS DISTINCT FROM OLD.excluido_em THEN 'excluido' ELSE 'avaliacao' END);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_representante_auditar() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mimo_representante_criado AFTER INSERT ON public.mimo_representantes FOR EACH ROW EXECUTE FUNCTION public.mimo_representante_auditar();
CREATE TRIGGER mimo_representante_editado BEFORE UPDATE ON public.mimo_representantes FOR EACH ROW EXECUTE FUNCTION public.mimo_representante_auditar();

CREATE FUNCTION public.mimo_inscrever_representante(p_dados jsonb,p_ip_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e uuid;n integer;novo uuid;
BEGIN
 IF p_ip_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid request';END IF;
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL THEN RAISE EXCEPTION 'Unavailable';END IF;
 INSERT INTO public.mimo_representantes_limites(ip_hash,janela,tentativas) VALUES(p_ip_hash,date_trunc('hour',now()),1)
 ON CONFLICT(ip_hash,janela) DO UPDATE SET tentativas=mimo_representantes_limites.tentativas+1 RETURNING tentativas INTO n;
 DELETE FROM public.mimo_representantes_limites WHERE janela<now()-interval '2 days';
 IF n>30 THEN RETURN '"limite"'::jsonb;END IF;
 INSERT INTO public.mimo_representantes(empresa_id,nome,email,whatsapp,cidade,uf,regiao_atuacao,experiencia,segmentos,carteira_clientes,marcas_atuais,core,disponibilidade,consentimento)
 VALUES(e,trim(p_dados->>'nome'),p_dados->>'email',p_dados->>'whatsapp',trim(p_dados->>'cidade'),p_dados->>'uf',trim(p_dados->>'regiao_atuacao'),p_dados->>'experiencia',
 CASE WHEN jsonb_typeof(p_dados->'segmentos')='array' THEN ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_dados->'segmentos')) ELSE NULL END,
 (p_dados->>'carteira_clientes')::integer,coalesce(p_dados->>'marcas_atuais',''),p_dados->>'core',p_dados->>'disponibilidade',(p_dados->>'consentimento')::boolean)
 ON CONFLICT DO NOTHING RETURNING id INTO novo;
 IF novo IS NULL THEN RETURN '"duplicado"'::jsonb;END IF;RETURN '"recebido"'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.mimo_inscrever_representante(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_inscrever_representante(jsonb,text) TO service_role;

CREATE FUNCTION public.mimo_representante_excluir(p_id uuid,p_versao integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e uuid;
BEGIN
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL OR NOT public.tem_papel_empresa(e,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Access denied';END IF;
 UPDATE public.mimo_representantes SET excluido_em=clock_timestamp(),excluido_por=auth.uid() WHERE id=p_id AND empresa_id=e AND versao=p_versao AND excluido_em IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.mimo_representante_excluir(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_representante_excluir(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
