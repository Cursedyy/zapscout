-- PREPARADA, NÃO APLICADA. Requer confirmação do backup do banco compartilhado.
-- Aplicar byte a byte com lov_database--migration, nunca manualmente.
-- Somente tabelas novas; não altera autenticação, leads, indicadores ou permissões existentes.
CREATE TABLE public.mimo_tira_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
  catalogo jsonb NOT NULL DEFAULT '[]', modelos jsonb NOT NULL DEFAULT '[]', taxas jsonb NOT NULL DEFAULT '[313,368,368,368,368,368,589,589,589,589,589,589]',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.mimo_tira_config TO authenticated;
GRANT ALL ON public.mimo_tira_config TO service_role;
ALTER TABLE public.mimo_tira_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_config_read ON public.mimo_tira_config FOR SELECT TO authenticated USING (public.is_membro_empresa(empresa_id, auth.uid()));

CREATE TABLE public.mimo_tira_pedidos (
  id uuid PRIMARY KEY, empresa_id uuid NOT NULL REFERENCES public.empresas(id), lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE, versao integer NOT NULL DEFAULT 1,
  documento jsonb NOT NULL, pix jsonb, recebimentos jsonb NOT NULL DEFAULT '[]',
  total bigint NOT NULL DEFAULT 0, produtos bigint NOT NULL DEFAULT 0, frete bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho', created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (empresa_id,id), CHECK (versao>0 AND total>=0 AND produtos>=0 AND frete>=0),
  CHECK (status IN ('rascunho','aguardando_pagamento','confirmado','faturado','enviado','entregue','cancelado'))
);
GRANT SELECT ON public.mimo_tira_pedidos TO authenticated;
GRANT ALL ON public.mimo_tira_pedidos TO service_role;
ALTER TABLE public.mimo_tira_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_pedidos_read ON public.mimo_tira_pedidos FOR SELECT TO authenticated USING (
  public.is_membro_empresa(empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(lead_id,auth.uid())
);

CREATE TABLE public.mimo_tira_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, pedido_id uuid NOT NULL,
  versao integer NOT NULL, documento jsonb NOT NULL, autor_id uuid NOT NULL,
  acao text NOT NULL DEFAULT 'salvar', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(pedido_id,versao), FOREIGN KEY(empresa_id,pedido_id) REFERENCES public.mimo_tira_pedidos(empresa_id,id)
);
GRANT SELECT ON public.mimo_tira_versoes TO authenticated;
GRANT SELECT,INSERT ON public.mimo_tira_versoes TO service_role;
ALTER TABLE public.mimo_tira_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_versoes_read ON public.mimo_tira_versoes FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.mimo_tira_pedidos p WHERE p.id=pedido_id AND p.empresa_id=mimo_tira_versoes.empresa_id
    AND public.is_membro_empresa(p.empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(p.lead_id,auth.uid()))
);
CREATE INDEX tira_pedidos_empresa_data ON public.mimo_tira_pedidos(empresa_id,updated_at DESC);
CREATE INDEX tira_pedidos_lead ON public.mimo_tira_pedidos(lead_id);
CREATE INDEX tira_versoes_pedido ON public.mimo_tira_versoes(empresa_id,pedido_id,versao DESC);

CREATE FUNCTION public.mimo_tira_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l public.mimo_leads; recebido bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'pedidos não podem ser apagados'; END IF;
  SELECT * INTO l FROM public.mimo_leads WHERE id=NEW.lead_id;
  IF l.empresa_id IS DISTINCT FROM NEW.empresa_id THEN RAISE EXCEPTION 'cliente de outra empresa'; END IF;
  IF NEW.documento->>'leadId' IS DISTINCT FROM NEW.lead_id::text OR NEW.documento->>'status' IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'documento inconsistente'; END IF;
  IF TG_OP='UPDATE' AND (NEW.empresa_id<>OLD.empresa_id OR NEW.lead_id<>OLD.lead_id OR NEW.numero<>OLD.numero OR NEW.created_at<>OLD.created_at) THEN RAISE EXCEPTION 'identidade imutável'; END IF;
  IF NEW.status IN ('faturado','enviado','entregue') AND NEW.documento->'pagamento'->>'forma'='pix' AND NEW.pix IS NULL THEN RAISE EXCEPTION 'PIX não confirmado'; END IF;
  IF NEW.status IN ('faturado','enviado','entregue') AND NEW.documento->'pagamento'->>'faturadoEm' IS NULL THEN RAISE EXCEPTION 'faturamento obrigatório'; END IF;
  IF NEW.status NOT IN ('rascunho','cancelado') AND NEW.documento->>'fretePagador' NOT IN ('mimo','cliente') THEN RAISE EXCEPTION 'responsabilidade do frete obrigatória'; END IF;
  SELECT coalesce(sum((r->>'valor')::bigint),0) INTO recebido FROM jsonb_array_elements(NEW.recebimentos) r;
  IF recebido>NEW.total THEN RAISE EXCEPTION 'total inferior aos recebimentos'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tira_guard BEFORE INSERT OR UPDATE OR DELETE ON public.mimo_tira_pedidos FOR EACH ROW EXECUTE FUNCTION public.mimo_tira_guard();

CREATE FUNCTION public.mimo_tira_auditoria_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'histórico imutável'; END $$;
CREATE TRIGGER tira_auditoria_guard BEFORE UPDATE OR DELETE ON public.mimo_tira_versoes FOR EACH ROW EXECUTE FUNCTION public.mimo_tira_auditoria_guard();

-- Service-only RPC: actor comes only from a bearer-validated server function,
-- never from user data. Membership and lead assignment are rechecked under locks.
CREATE FUNCTION public.mimo_tira_salvar(_empresa uuid,_ator uuid,_id uuid,_versao integer,_documento jsonb,_total bigint,_produtos bigint,_frete bigint)
RETURNS public.mimo_tira_pedidos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mimo_tira_pedidos; l public.mimo_leads; m public.empresa_membros; e public.empresas;
BEGIN
  SELECT * INTO e FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
  SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo FOR SHARE;
  IF e.id IS NULL OR m.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO l FROM public.mimo_leads WHERE id=(_documento->>'leadId')::uuid AND empresa_id=_empresa FOR SHARE;
  IF l.id IS NULL OR (m.papel='vendedor' AND l.responsavel_id IS DISTINCT FROM _ator) THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id FOR UPDATE;
  IF p.id IS NULL THEN
    IF _versao<>0 THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    INSERT INTO public.mimo_tira_pedidos(id,empresa_id,lead_id,documento,total,produtos,frete,status)
      VALUES(_id,_empresa,l.id,_documento,_total,_produtos,_frete,_documento->>'status') RETURNING * INTO p;
  ELSE
    IF p.empresa_id<>_empresa OR p.lead_id<>l.id THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
    IF p.versao<>_versao THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    UPDATE public.mimo_tira_pedidos SET documento=_documento,total=_total,produtos=_produtos,frete=_frete,status=_documento->>'status',
      pix=CASE WHEN _total<>p.total OR _documento->'pagamento'->>'forma' IS DISTINCT FROM p.documento->'pagamento'->>'forma' THEN NULL ELSE p.pix END,
      versao=p.versao+1,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
  END IF;
  INSERT INTO public.mimo_tira_versoes(empresa_id,pedido_id,versao,documento,autor_id,acao) VALUES(_empresa,p.id,p.versao,p.documento,_ator,'salvar');
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_salvar(uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_salvar(uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint) TO service_role;

CREATE FUNCTION public.mimo_tira_configurar(_empresa uuid,_ator uuid,_versao text,_catalogo jsonb,_modelos jsonb,_taxas jsonb)
RETURNS public.mimo_tira_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.mimo_tira_config; m public.empresa_membros;
BEGIN
  PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel IN ('administrador','gestor') FOR SHARE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.mimo_tira_config WHERE empresa_id=_empresa FOR UPDATE;
  IF c.empresa_id IS NULL THEN
    IF _versao IS NOT NULL THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    INSERT INTO public.mimo_tira_config(empresa_id,catalogo,modelos,taxas) VALUES(_empresa,_catalogo,_modelos,_taxas) RETURNING * INTO c;
  ELSE
    IF _versao IS NULL OR c.updated_at<>_versao::timestamptz THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    UPDATE public.mimo_tira_config SET catalogo=_catalogo,modelos=_modelos,taxas=_taxas,updated_at=clock_timestamp() WHERE empresa_id=_empresa RETURNING * INTO c;
  END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_configurar(uuid,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_configurar(uuid,uuid,text,jsonb,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.mimo_tira_receber(_empresa uuid,_ator uuid,_id uuid,_versao integer,_operacao text,_valor bigint)
RETURNS public.mimo_tira_pedidos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mimo_tira_pedidos; m public.empresa_membros; l public.mimo_leads; r jsonb; recebido bigint;
BEGIN
  PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo FOR SHARE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id AND empresa_id=_empresa FOR UPDATE;
  SELECT * INTO l FROM public.mimo_leads WHERE id=p.lead_id AND empresa_id=_empresa FOR SHARE;
  IF p.id IS NULL OR l.id IS NULL OR (m.papel='vendedor' AND l.responsavel_id IS DISTINCT FROM _ator) THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p.recebimentos) x WHERE x->>'operacao'=_operacao) THEN RETURN p; END IF;
  IF p.versao<>_versao THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
  SELECT coalesce(sum((x->>'valor')::bigint),0) INTO recebido FROM jsonb_array_elements(p.recebimentos) x;
  IF p.status='cancelado' OR _valor<=0 OR recebido+_valor>p.total THEN RAISE EXCEPTION 'recebimento inválido'; END IF;
  IF p.documento->'pagamento'->>'forma'='pix' AND recebido+_valor<>p.total THEN RAISE EXCEPTION 'PIX antecipado integral'; END IF;
  r=jsonb_build_object('operacao',_operacao,'valor',_valor,'usuarioId',_ator,'confirmadoEm',clock_timestamp());
  UPDATE public.mimo_tira_pedidos SET recebimentos=p.recebimentos||jsonb_build_array(r),pix=CASE WHEN p.documento->'pagamento'->>'forma'='pix' THEN r ELSE NULL END,
    versao=p.versao+1,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
  INSERT INTO public.mimo_tira_versoes(empresa_id,pedido_id,versao,documento,autor_id,acao) VALUES(_empresa,p.id,p.versao,p.documento,_ator,'recebimento');
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_receber(uuid,uuid,uuid,integer,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_receber(uuid,uuid,uuid,integer,text,bigint) TO service_role;

-- Reversão de aplicação: remover somente a navegação nova e deixar as estruturas
-- inacessíveis por escrita (já são service-only). Não apagar pedidos nem histórico.
-- Sem DROP, alteração de tabela legada, backfill ou criação de dados de teste.