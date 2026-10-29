ALTER TABLE public.mimo_leads
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_normalizado text,
  ADD COLUMN IF NOT EXISTS motivo_perda_codigo text,
  ADD COLUMN IF NOT EXISTS orcamento_estimado numeric(14,2),
  ADD COLUMN IF NOT EXISTS prioridade_revisada text,
  ADD COLUMN IF NOT EXISTS prioridade_revisada_por uuid,
  ADD COLUMN IF NOT EXISTS prioridade_revisada_em timestamptz;
ALTER TABLE public.mimo_leads ADD CONSTRAINT mimo_leads_motivo_perda_codigo_chk CHECK (motivo_perda_codigo IS NULL OR motivo_perda_codigo IN ('preco','falta_interesse','falta_orcamento','sem_resposta','sem_perfil','concorrente'));
ALTER TABLE public.mimo_leads ADD CONSTRAINT mimo_leads_prioridade_revisada_chk CHECK (prioridade_revisada IS NULL OR prioridade_revisada IN ('alta','media','baixa'));
ALTER TABLE public.mimo_leads ADD CONSTRAINT mimo_leads_orcamento_chk CHECK (orcamento_estimado IS NULL OR orcamento_estimado >= 0);
CREATE INDEX IF NOT EXISTS mimo_leads_email_idx ON public.mimo_leads(empresa_id,email_normalizado) WHERE email_normalizado IS NOT NULL;
COMMENT ON COLUMN public.mimo_leads.motivo_perda IS 'Observação complementar da perda; o motivo padronizado fica em motivo_perda_codigo.';

CREATE OR REPLACE FUNCTION public.mimo_lead_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=NEW.empresa_id AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Empresa inválida'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Identidade imutável'; END IF;
  IF auth.uid() IS NOT NULL AND public.empresa_papel_de(OLD.empresa_id,auth.uid())='vendedor' AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN RAISE EXCEPTION 'Não é permitido reatribuir este lead'; END IF;
 END IF;
 IF NEW.responsavel_id IS NOT NULL AND NOT public.is_membro_empresa(NEW.empresa_id,NEW.responsavel_id) AND (TG_OP='INSERT' OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id) THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
 NEW.nome_empresa:=btrim(NEW.nome_empresa);
 NEW.email:=lower(btrim(coalesce(NEW.email,'')));
 IF length(NEW.nome_empresa)<2 OR length(NEW.nome_empresa)>200 OR length(NEW.nome_contato)>200 OR length(NEW.telefone)>40 OR length(NEW.observacoes)>10000 OR length(NEW.motivo_perda)>2000 OR length(NEW.campanha_origem)>200 OR length(NEW.anuncio_origem)>200 OR length(NEW.email)>254 THEN RAISE EXCEPTION 'Dados inválidos'; END IF;
 IF NEW.email<>'' AND NEW.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'E-mail inválido'; END IF;
 NEW.email_normalizado:=NULLIF(NEW.email,'');
 NEW.telefone_normalizado:=public.mimo_normalizar_telefone(NEW.telefone);
 IF NEW.entrada_em>now()+interval '5 minutes' THEN RAISE EXCEPTION 'Data de entrada inválida'; END IF;
 IF NEW.etapa='pedido_fechado' AND (NEW.valor_pedido IS NULL OR NEW.conversao_em IS NULL) THEN RAISE EXCEPTION 'Informe o valor e a data do pedido fechado'; END IF;
 IF NEW.conversao_em IS NOT NULL AND (NEW.conversao_em<NEW.entrada_em OR NEW.conversao_em>now()+interval '5 minutes') THEN RAISE EXCEPTION 'Data de conversão inválida'; END IF;
 -- New losses (or changed loss reasons) need a standardized reason; legacy rows keep their free text.
 IF NEW.etapa='perdido' AND NEW.motivo_perda_codigo IS NULL AND (TG_OP='INSERT' OR OLD.etapa<>'perdido' OR OLD.motivo_perda_codigo IS NOT NULL) THEN RAISE EXCEPTION 'Informe o motivo da perda'; END IF;
 IF NEW.etapa='perdido' AND NEW.motivo_perda_codigo IS NULL AND btrim(NEW.motivo_perda)='' THEN RAISE EXCEPTION 'Informe o motivo da perda'; END IF;
 IF NEW.prioridade_revisada IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.prioridade_revisada END) THEN
  IF auth.uid() IS NOT NULL AND NOT public.tem_papel_empresa(NEW.empresa_id,auth.uid(),ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel]) THEN RAISE EXCEPTION 'Só administrador ou gestor revisa a prioridade'; END IF;
  NEW.prioridade_revisada_por:=CASE WHEN NEW.prioridade_revisada IS NULL THEN NULL ELSE auth.uid() END;
  NEW.prioridade_revisada_em:=CASE WHEN NEW.prioridade_revisada IS NULL THEN NULL ELSE clock_timestamp() END;
 ELSIF TG_OP='UPDATE' THEN
  NEW.prioridade_revisada_por:=OLD.prioridade_revisada_por; NEW.prioridade_revisada_em:=OLD.prioridade_revisada_em;
 END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_lead_validar() FROM PUBLIC,anon,authenticated;

-- Duplicate check across the company without leaking leads the caller cannot read.
CREATE OR REPLACE FUNCTION public.mimo_verificar_duplicados(_empresa uuid, _telefone text, _email text, _ignorar uuid DEFAULT NULL)
RETURNS TABLE(lead_id uuid, criterio text, visivel boolean, nome_empresa text, etapa text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE tel text; em text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_membro_empresa(_empresa,auth.uid()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 BEGIN tel:=public.mimo_normalizar_telefone(coalesce(_telefone,'')); EXCEPTION WHEN OTHERS THEN tel:=NULL; END;
 em:=NULLIF(lower(btrim(coalesce(_email,''))),'');
 IF length(em)>254 THEN em:=NULL; END IF;
 RETURN QUERY
 SELECT CASE WHEN v THEN l.id END,
        CASE WHEN tel IS NOT NULL AND l.telefone_normalizado=tel AND em IS NOT NULL AND l.email_normalizado=em THEN 'telefone_email'
             WHEN tel IS NOT NULL AND l.telefone_normalizado=tel THEN 'telefone' ELSE 'email' END,
        v, CASE WHEN v THEN l.nome_empresa END, CASE WHEN v THEN l.etapa END
 FROM public.mimo_leads l
 CROSS JOIN LATERAL (SELECT public.pode_ver_mimo_lead(l.id,auth.uid()) AS v) x
 WHERE l.empresa_id=_empresa AND (_ignorar IS NULL OR l.id<>_ignorar)
   AND ((tel IS NOT NULL AND l.telefone_normalizado=tel) OR (em IS NOT NULL AND l.email_normalizado=em))
 LIMIT 10;
END $$;
REVOKE ALL ON FUNCTION public.mimo_verificar_duplicados(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_verificar_duplicados(uuid,text,text,uuid) TO authenticated;