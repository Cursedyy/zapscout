-- Fila de espera: lead sem responsável precisa ficar visível a quem atende,
-- e o vendedor precisa poder assumi-lo sem ganhar permissão de reatribuir lead alheio.
CREATE OR REPLACE FUNCTION public.mimo_leads_em_espera(_limite integer DEFAULT 20)
RETURNS TABLE(id uuid, empresa_id uuid, nome_empresa text, nome_contato text, telefone text, perfil text, origem text, entrada_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 RETURN QUERY
 SELECT l.id,l.empresa_id,l.nome_empresa,l.nome_contato,l.telefone,l.perfil,l.origem,l.entrada_em
 FROM public.mimo_leads l
 WHERE l.responsavel_id IS NULL
   AND l.etapa<>'perdido'
   AND public.tem_papel_empresa(l.empresa_id,auth.uid(),ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
 ORDER BY l.entrada_em, l.id
 LIMIT greatest(1,least(coalesce(_limite,20),50));
END $$;
REVOKE ALL ON FUNCTION public.mimo_leads_em_espera(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_leads_em_espera(integer) TO authenticated, service_role;

-- Só atribui quando o lead está sem responsável: quem chega depois nunca toma o atendimento.
CREATE OR REPLACE FUNCTION public.mimo_assumir_lead(_lead uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.mimo_leads;
BEGIN
 IF auth.uid() IS NULL THEN RETURN false; END IF;
 SELECT * INTO l FROM public.mimo_leads WHERE id=_lead FOR UPDATE;
 IF l.id IS NULL OR NOT public.is_membro_empresa(l.empresa_id,auth.uid()) THEN RETURN false; END IF;
 IF l.responsavel_id IS NOT NULL THEN RETURN l.responsavel_id=auth.uid(); END IF;
 IF public.empresa_papel_de(l.empresa_id,auth.uid()) NOT IN ('administrador','gestor','vendedor') THEN RETURN false; END IF;
 UPDATE public.mimo_leads SET responsavel_id=auth.uid() WHERE id=_lead;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mimo_assumir_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_assumir_lead(uuid) TO authenticated, service_role;

-- Vendedor continua proibido de reatribuir, exceto ao assumir um lead sem responsável.
CREATE OR REPLACE FUNCTION public.mimo_lead_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=NEW.empresa_id AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Empresa inválida'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Identidade imutável'; END IF;
  IF auth.uid() IS NOT NULL AND public.empresa_papel_de(OLD.empresa_id,auth.uid())='vendedor' AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
     AND NOT (OLD.responsavel_id IS NULL AND NEW.responsavel_id=auth.uid()) THEN RAISE EXCEPTION 'Não é permitido reatribuir este lead'; END IF;
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
