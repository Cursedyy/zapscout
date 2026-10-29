CREATE OR REPLACE FUNCTION public.mimo_normalizar_telefone(valor text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE n text;
BEGIN
 n := regexp_replace(coalesce(valor,''), '[^0-9]', '', 'g');
 IF n='' THEN RETURN NULL; END IF;
 IF left(n,2)='00' THEN n:=substr(n,3); END IF;
 IF length(n) IN (10,11) THEN n:='55'||n; END IF;
 IF length(n)<12 OR length(n)>15 OR n ~ '^([0-9])\1+$' THEN RAISE EXCEPTION 'Telefone inválido'; END IF;
 RETURN n;
END $$;
CREATE TABLE public.mimo_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome_empresa text NOT NULL, nome_contato text NOT NULL DEFAULT '', telefone text NOT NULL DEFAULT '', telefone_normalizado text,
 perfil text NOT NULL DEFAULT 'outro' CHECK (perfil IN ('emporio','supermercado','farmacia','distribuidor','representante','outro')),
 origem text NOT NULL DEFAULT 'outra' CHECK (origem IN ('meta_ads','whatsapp','indicacao','organico','outra')),
 campanha_origem text NOT NULL DEFAULT '', anuncio_origem text NOT NULL DEFAULT '', entrada_em timestamptz NOT NULL DEFAULT now(),
 etapa text NOT NULL DEFAULT 'novo' CHECK(etapa IN ('novo','contato_realizado','em_negociacao','pedido_fechado','perdido')),
 qualificacao text NOT NULL DEFAULT 'pendente' CHECK(qualificacao IN ('qualificado','nao_qualificado','pendente')),
 responsavel_id uuid, valor_pedido numeric(14,2), conversao_em timestamptz, motivo_perda text NOT NULL DEFAULT '', observacoes text NOT NULL DEFAULT '',
 created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(valor_pedido IS NULL OR valor_pedido>=0)
);
GRANT SELECT,INSERT,UPDATE ON public.mimo_leads TO authenticated;
GRANT ALL ON public.mimo_leads TO service_role;
ALTER TABLE public.mimo_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_leads_read ON public.mimo_leads FOR SELECT TO authenticated USING(public.is_membro_empresa(empresa_id,auth.uid()));
CREATE POLICY mimo_leads_insert ON public.mimo_leads FOR INSERT TO authenticated WITH CHECK(public.is_membro_empresa(empresa_id,auth.uid()) AND created_by=auth.uid() AND (public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) OR responsavel_id=auth.uid()));
CREATE POLICY mimo_leads_update ON public.mimo_leads FOR UPDATE TO authenticated USING(public.is_membro_empresa(empresa_id,auth.uid()) AND (public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) OR responsavel_id=auth.uid())) WITH CHECK(public.is_membro_empresa(empresa_id,auth.uid()) AND (public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) OR responsavel_id=auth.uid()));
CREATE UNIQUE INDEX mimo_leads_telefone_unico ON public.mimo_leads(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL;
CREATE INDEX mimo_leads_periodo ON public.mimo_leads(empresa_id,entrada_em DESC,id);
CREATE TABLE public.mimo_lead_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id), lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
 alterado_por uuid, acao text NOT NULL, anterior jsonb, atual jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mimo_lead_historico TO authenticated;
GRANT ALL ON public.mimo_lead_historico TO service_role;
ALTER TABLE public.mimo_lead_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_historico_read ON public.mimo_lead_historico FOR SELECT TO authenticated USING(public.is_membro_empresa(empresa_id,auth.uid()));
CREATE INDEX mimo_historico_lead ON public.mimo_lead_historico(empresa_id,lead_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.mimo_lead_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=NEW.empresa_id AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Empresa inválida'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Identidade imutável'; END IF;
  IF auth.uid() IS NOT NULL AND public.empresa_papel_de(OLD.empresa_id,auth.uid())='vendedor' AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN RAISE EXCEPTION 'Não é permitido reatribuir este lead'; END IF;
 END IF;
 IF NEW.responsavel_id IS NOT NULL AND NOT public.is_membro_empresa(NEW.empresa_id,NEW.responsavel_id) AND (TG_OP='INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
 NEW.nome_empresa:=btrim(NEW.nome_empresa);
 IF length(NEW.nome_empresa)<2 OR length(NEW.nome_empresa)>200 OR length(NEW.nome_contato)>200 OR length(NEW.telefone)>40 OR length(NEW.observacoes)>10000 OR length(NEW.motivo_perda)>2000 OR length(NEW.campanha_origem)>200 OR length(NEW.anuncio_origem)>200 THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
 NEW.telefone_normalizado:=public.mimo_normalizar_telefone(NEW.telefone);
 IF NEW.entrada_em>now()+interval '5 minutes' THEN RAISE EXCEPTION 'Data de entrada inválida'; END IF;
 IF NEW.etapa='pedido_fechado' AND (NEW.valor_pedido IS NULL OR NEW.conversao_em IS NULL) THEN RAISE EXCEPTION 'Informe o valor e a data do pedido fechado'; END IF;
 IF NEW.conversao_em IS NOT NULL AND (NEW.conversao_em<NEW.entrada_em OR NEW.conversao_em>now()+interval '5 minutes') THEN RAISE EXCEPTION 'Data de conversão inválida'; END IF;
 IF NEW.etapa='perdido' AND btrim(NEW.motivo_perda)='' THEN RAISE EXCEPTION 'Informe o motivo da perda'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER mimo_lead_validar BEFORE INSERT OR UPDATE ON public.mimo_leads FOR EACH ROW EXECUTE FUNCTION public.mimo_lead_validar();
CREATE OR REPLACE FUNCTION public.mimo_lead_auditar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.mimo_lead_historico(empresa_id,lead_id,alterado_por,acao,atual) VALUES(NEW.empresa_id,NEW.id,auth.uid(),'cadastro',to_jsonb(NEW));
 ELSIF (to_jsonb(OLD)-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'updated_at') THEN
  INSERT INTO public.mimo_lead_historico(empresa_id,lead_id,alterado_por,acao,anterior,atual) VALUES(NEW.empresa_id,NEW.id,auth.uid(),'edicao',to_jsonb(OLD),to_jsonb(NEW));
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER mimo_lead_auditar AFTER INSERT OR UPDATE ON public.mimo_leads FOR EACH ROW EXECUTE FUNCTION public.mimo_lead_auditar();
REVOKE ALL ON FUNCTION public.mimo_lead_validar(),public.mimo_lead_auditar() FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.mimo_leads IS 'CRM exclusivo MiMo; uma entidade por telefone normalizado, reaberturas e pedidos preservados no histórico, sem exclusão pelo aplicativo.';
COMMENT ON TABLE public.mimo_lead_historico IS 'Histórico imutável de cadastro e mudanças, incluindo pedidos e perdas; não permite escrita por membros.';