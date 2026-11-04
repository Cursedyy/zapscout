-- Backup compartilhado verificado em docs/mimo-carteira-implementacao.md (03/11/2026).
CREATE TABLE public.mimo_campanhas_comerciais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome text NOT NULL CHECK(length(trim(nome)) BETWEEN 3 AND 200),
 inicio date NOT NULL, fim date NOT NULL CHECK(fim>=inicio),
 produtos text NOT NULL DEFAULT '' CHECK(length(produtos)<=10000),
 condicoes text NOT NULL DEFAULT '' CHECK(length(condicoes)<=10000),
 status text NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','publicada','arquivada')),
 versao integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 updated_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(status<>'publicada' OR (length(trim(produtos))>0 AND length(trim(condicoes))>0))
);
CREATE INDEX ON public.mimo_campanhas_comerciais(empresa_id,inicio DESC);
ALTER TABLE public.mimo_campanhas_comerciais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_campanhas_comerciais FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.mimo_campanhas_comerciais TO authenticated;
CREATE POLICY campanhas_ler ON public.mimo_campanhas_comerciais FOR SELECT TO authenticated USING (
 public.is_membro_empresa(empresa_id,auth.uid()) AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
 AND (status='publicada' OR public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[]))
);
CREATE POLICY campanhas_criar ON public.mimo_campanhas_comerciais FOR INSERT TO authenticated WITH CHECK (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE POLICY campanhas_editar ON public.mimo_campanhas_comerciais FOR UPDATE TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
) WITH CHECK (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE FUNCTION public.mimo_campanha_carimbar() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id THEN RAISE EXCEPTION 'Identidade da campanha não pode mudar'; END IF;
  NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at; NEW.versao=OLD.versao+1;
 ELSE NEW.created_by=auth.uid(); NEW.created_at=now(); NEW.versao=1;
 END IF;
 NEW.updated_by=auth.uid(); NEW.updated_at=clock_timestamp(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_campanha_carimbar() FROM PUBLIC;
CREATE TRIGGER mimo_campanha_carimbo BEFORE INSERT OR UPDATE ON public.mimo_campanhas_comerciais FOR EACH ROW EXECUTE FUNCTION public.mimo_campanha_carimbar();
