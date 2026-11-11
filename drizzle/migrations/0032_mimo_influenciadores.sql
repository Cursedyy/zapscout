-- Prepared only. Apply via the migration workflow after shared-database backup verification.
CREATE TABLE public.mimo_influenciadores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 campanha text NOT NULL DEFAULT 'lancamento-2026-11' CHECK(campanha='lancamento-2026-11'),
 nome text NOT NULL CHECK(length(trim(nome)) BETWEEN 3 AND 150),
 whatsapp text NOT NULL CHECK(whatsapp ~ '^[1-9][0-9]{9,10}$'),
 rede text NOT NULL CHECK(rede IN ('Instagram','TikTok')),
 perfil text NOT NULL CHECK(perfil ~ '^[a-z0-9_][a-z0-9_.]{0,29}$'),
 cidade text NOT NULL CHECK(length(trim(cidade)) BETWEEN 2 AND 100),
 uf text NOT NULL CHECK(uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 seguidores integer NOT NULL CHECK(seguidores BETWEEN 0 AND 1000000000),
 visualizacoes text NOT NULL CHECK(visualizacoes IN ('Até 1 mil','Mais de 1 mil até 5 mil','Mais de 5 mil até 20 mil','Mais de 20 mil')),
 nicho text NOT NULL CHECK(nicho IN ('Maternidade e família','Alimentação e receitas','Lifestyle e rotina','Outros')),
 parceria text NOT NULL CHECK(parceria IN ('Recebimento de produtos (permuta)','Parceria remunerada','Ambas as opções')),
 consentimento boolean NOT NULL CHECK(consentimento), aviso_versao text NOT NULL DEFAULT '2026-11-v1',
 etapa text NOT NULL DEFAULT 'Novo' CHECK(etapa IN ('Novo','Em análise','Pré-selecionado','Contatado','Aprovado','Confirmado','Não selecionado','Desistiu')),
 notas text NOT NULL DEFAULT '' CHECK(length(notas)<=5000), versao integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,campanha,whatsapp), UNIQUE(empresa_id,campanha,rede,perfil)
);
CREATE INDEX ON public.mimo_influenciadores(empresa_id,campanha,created_at DESC,id);
CREATE TABLE public.mimo_influenciadores_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 influenciador_id uuid NOT NULL REFERENCES public.mimo_influenciadores(id),
 etapa text NOT NULL, notas text NOT NULL, ator_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.mimo_influenciadores_historico(empresa_id,influenciador_id,created_at DESC);
CREATE TABLE public.mimo_influenciadores_limites (
 ip_hash text NOT NULL, janela timestamptz NOT NULL, tentativas integer NOT NULL, PRIMARY KEY(ip_hash,janela)
);
ALTER TABLE public.mimo_influenciadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_influenciadores_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_influenciadores_limites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_influenciadores,public.mimo_influenciadores_historico,public.mimo_influenciadores_limites FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mimo_influenciadores,public.mimo_influenciadores_historico TO authenticated;
GRANT UPDATE(etapa,notas) ON public.mimo_influenciadores TO authenticated;
GRANT ALL ON public.mimo_influenciadores,public.mimo_influenciadores_historico,public.mimo_influenciadores_limites TO service_role;
CREATE POLICY influenciadores_ler ON public.mimo_influenciadores FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE POLICY influenciadores_avaliar ON public.mimo_influenciadores FOR UPDATE TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
) WITH CHECK (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE POLICY influenciadores_historico_ler ON public.mimo_influenciadores_historico FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE FUNCTION public.mimo_influenciador_auditar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id THEN RAISE EXCEPTION 'Identidade imutável'; END IF;
  NEW.versao=OLD.versao+1; NEW.updated_at=clock_timestamp(); NEW.created_at=OLD.created_at;
 END IF;
 INSERT INTO public.mimo_influenciadores_historico(empresa_id,influenciador_id,etapa,notas,ator_id)
 VALUES(NEW.empresa_id,NEW.id,NEW.etapa,NEW.notas,auth.uid());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_influenciador_auditar() FROM PUBLIC,anon,authenticated;
-- AFTER INSERT ensures the history foreign key exists; BEFORE UPDATE increments the canonical version.
CREATE TRIGGER mimo_influenciador_criado AFTER INSERT ON public.mimo_influenciadores FOR EACH ROW EXECUTE FUNCTION public.mimo_influenciador_auditar();
CREATE TRIGGER mimo_influenciador_editado BEFORE UPDATE ON public.mimo_influenciadores FOR EACH ROW EXECUTE FUNCTION public.mimo_influenciador_auditar();
CREATE FUNCTION public.mimo_inscrever_influenciador(p_dados jsonb,p_ip_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE empresa uuid; tentativas integer;
BEGIN
 IF p_ip_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Requisição inválida'; END IF;
 SELECT id INTO empresa FROM public.empresas WHERE slug='mimo' AND ativa;
 IF empresa IS NULL THEN RAISE EXCEPTION 'Campanha indisponível'; END IF;
 INSERT INTO public.mimo_influenciadores_limites(ip_hash,janela,tentativas) VALUES(p_ip_hash,date_trunc('hour',now()),1)
 ON CONFLICT(ip_hash,janela) DO UPDATE SET tentativas=mimo_influenciadores_limites.tentativas+1
 RETURNING mimo_influenciadores_limites.tentativas INTO tentativas;
 DELETE FROM public.mimo_influenciadores_limites WHERE janela<now()-interval '2 days';
 IF tentativas>30 THEN RETURN '"limite"'::jsonb; END IF;
 INSERT INTO public.mimo_influenciadores(empresa_id,nome,whatsapp,rede,perfil,cidade,uf,seguidores,visualizacoes,nicho,parceria,consentimento)
 VALUES(empresa,trim(p_dados->>'nome'),p_dados->>'whatsapp',p_dados->>'rede',p_dados->>'perfil',trim(p_dados->>'cidade'),p_dados->>'uf',
 (p_dados->>'seguidores')::integer,p_dados->>'visualizacoes',p_dados->>'nicho',p_dados->>'parceria',(p_dados->>'consentimento')::boolean)
 ON CONFLICT DO NOTHING;
 RETURN '"recebido"'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.mimo_inscrever_influenciador(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_inscrever_influenciador(jsonb,text) TO service_role;
