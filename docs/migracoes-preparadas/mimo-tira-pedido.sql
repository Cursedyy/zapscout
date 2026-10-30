-- PREPARADA, NÃO APLICADA. Requer backup verificado do banco compartilhado e autorização específica.
-- Aplicar byte a byte com lov_database--migration, nunca manualmente. Somente estruturas novas:
-- não altera autenticação, leads, indicadores legados, membros ou permissões existentes.
-- Pré-condição verificada antes da aplicação: empresa_membros possui UNIQUE(empresa_id,user_id).

CREATE TABLE public.mimo_tira_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
  catalogo jsonb NOT NULL DEFAULT '[]', modelos jsonb NOT NULL DEFAULT '[]',
  taxas jsonb NOT NULL DEFAULT '[313,368,368,368,368,368,589,589,589,589,589,589]',
  brindes jsonb NOT NULL DEFAULT '[]',
  caixas jsonb NOT NULL DEFAULT '[{"id":"P","nome":"Caixa P","dimensoes":[23,16,17],"displays":4,"misturinhas":10,"ativo":true},{"id":"G","nome":"Caixa G","dimensoes":[24,24,18],"displays":8,"misturinhas":16,"ativo":true}]',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Custos não podem ser lidos diretamente pelo navegador; usar visão segura abaixo.
GRANT SELECT,INSERT,UPDATE ON public.mimo_tira_config TO service_role;
ALTER TABLE public.mimo_tira_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_config_read ON public.mimo_tira_config FOR SELECT TO authenticated USING (public.is_membro_empresa(empresa_id, auth.uid()));

-- Histórico permanente de catálogo, preços, modelos, brindes, taxas e caixas.
CREATE TABLE public.mimo_tira_config_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  config jsonb NOT NULL, autor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
GRANT SELECT ON public.mimo_tira_config_historico TO authenticated;
GRANT SELECT,INSERT ON public.mimo_tira_config_historico TO service_role;
ALTER TABLE public.mimo_tira_config_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_config_hist_read ON public.mimo_tira_config_historico FOR SELECT TO authenticated USING (
  public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador','gestor']::public.empresa_papel[])
);

CREATE TABLE public.mimo_tira_pedidos (
  id uuid PRIMARY KEY, empresa_id uuid NOT NULL REFERENCES public.empresas(id), lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE, versao integer NOT NULL DEFAULT 1,
  documento jsonb NOT NULL, pix jsonb, recebimentos jsonb NOT NULL DEFAULT '[]',
  total bigint NOT NULL DEFAULT 0, produtos bigint NOT NULL DEFAULT 0, frete bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho', cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (empresa_id,id), CHECK (versao>0 AND total>=0 AND produtos>=0 AND frete>=0),
  CHECK (status IN ('rascunho','aguardando_pagamento','confirmado','faturado','enviado','entregue','cancelado')),
  CHECK ((status='cancelado') = (cancelado_em IS NOT NULL AND cancelado_por IS NOT NULL AND length(trim(motivo_cancelamento))>=5))
);
-- Leitura apenas pela visão segura abaixo.
GRANT SELECT,INSERT,UPDATE ON public.mimo_tira_pedidos TO service_role;
ALTER TABLE public.mimo_tira_pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_pedidos_read ON public.mimo_tira_pedidos FOR SELECT TO authenticated USING (
  public.is_membro_empresa(empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(lead_id,auth.uid())
);

-- Cada versão guarda o estado completo (documento, status, totais, recebimentos e PIX).
CREATE TABLE public.mimo_tira_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, pedido_id uuid NOT NULL,
  versao integer NOT NULL, documento jsonb NOT NULL, snapshot jsonb NOT NULL, detalhes jsonb NOT NULL DEFAULT '{}',
  autor_id uuid NOT NULL, acao text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(pedido_id,versao), FOREIGN KEY(empresa_id,pedido_id) REFERENCES public.mimo_tira_pedidos(empresa_id,id),
  CHECK (acao IN ('salvar','status','recebimento','restaurar'))
);
-- Leitura apenas pela visão segura abaixo.
GRANT SELECT,INSERT ON public.mimo_tira_versoes TO service_role;
ALTER TABLE public.mimo_tira_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_versoes_read ON public.mimo_tira_versoes FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.mimo_tira_pedidos p WHERE p.id=pedido_id AND p.empresa_id=mimo_tira_versoes.empresa_id
    AND public.is_membro_empresa(p.empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(p.lead_id,auth.uid()))
);

-- Propostas emitidas: conteúdo congelado sem custo interno; PDF em armazenamento privado.
CREATE TABLE public.mimo_tira_propostas (
  id uuid PRIMARY KEY, empresa_id uuid NOT NULL, pedido_id uuid NOT NULL, versao integer NOT NULL,
  sequencia integer NOT NULL, numero text NOT NULL UNIQUE, documento jsonb NOT NULL, arquivo text NOT NULL, hash text NOT NULL,
  autor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(pedido_id,versao,sequencia), FOREIGN KEY(empresa_id,pedido_id) REFERENCES public.mimo_tira_pedidos(empresa_id,id),
  CHECK (hash ~ '^[0-9a-f]{64}$'), CHECK (arquivo LIKE empresa_id::text || '/' || pedido_id::text || '/%')
);
GRANT SELECT ON public.mimo_tira_propostas TO authenticated;
GRANT SELECT,INSERT ON public.mimo_tira_propostas TO service_role;
ALTER TABLE public.mimo_tira_propostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tira_propostas_read ON public.mimo_tira_propostas FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.mimo_tira_pedidos p WHERE p.id=pedido_id AND p.empresa_id=mimo_tira_propostas.empresa_id
    AND public.is_membro_empresa(p.empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(p.lead_id,auth.uid()))
);

-- Visões de leitura: predicate explícito de vínculo/lead; nenhuma tabela base com custos é concedida ao navegador.
CREATE FUNCTION public.mimo_tira_redigir(_doc jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_set(_doc,'{itens}',coalesce((SELECT jsonb_agg(i||jsonb_build_object('custoInterno',NULL)) FROM jsonb_array_elements(_doc->'itens') i),'[]'::jsonb))
$$;
CREATE VIEW public.mimo_tira_config_segura WITH (security_barrier=true) AS
 SELECT c.empresa_id,c.catalogo,c.modelos,c.taxas,c.caixas,c.updated_at,
 CASE WHEN public.tem_papel_empresa(c.empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) THEN c.brindes
 ELSE coalesce((SELECT jsonb_agg(b||jsonb_build_object('custoInterno',NULL)) FROM jsonb_array_elements(c.brindes) b),'[]'::jsonb) END AS brindes
 FROM public.mimo_tira_config c WHERE public.is_membro_empresa(c.empresa_id,auth.uid());
GRANT SELECT ON public.mimo_tira_config_segura TO authenticated;
CREATE VIEW public.mimo_tira_pedidos_seguros WITH (security_barrier=true) AS
 SELECT p.id,p.empresa_id,p.lead_id,p.numero,p.versao,p.pix,p.recebimentos,p.total,p.produtos,p.frete,p.status,p.created_at,p.updated_at,
 CASE WHEN public.tem_papel_empresa(p.empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) THEN p.documento ELSE public.mimo_tira_redigir(p.documento) END AS documento
 FROM public.mimo_tira_pedidos p WHERE public.is_membro_empresa(p.empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(p.lead_id,auth.uid());
GRANT SELECT ON public.mimo_tira_pedidos_seguros TO authenticated;
CREATE VIEW public.mimo_tira_versoes_seguras WITH (security_barrier=true) AS
 SELECT v.id,v.empresa_id,v.pedido_id,v.versao,v.autor_id,v.acao,v.created_at,
 CASE WHEN public.tem_papel_empresa(v.empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) THEN v.documento ELSE public.mimo_tira_redigir(v.documento) END AS documento,
 v.snapshot, CASE WHEN public.tem_papel_empresa(v.empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) THEN v.detalhes ELSE v.detalhes-'custoInterno' END AS detalhes
 FROM public.mimo_tira_versoes v JOIN public.mimo_tira_pedidos p ON p.id=v.pedido_id AND p.empresa_id=v.empresa_id
 WHERE public.is_membro_empresa(p.empresa_id,auth.uid()) AND public.pode_ver_mimo_lead(p.lead_id,auth.uid());
GRANT SELECT ON public.mimo_tira_versoes_seguras TO authenticated;

CREATE FUNCTION public.mimo_tira_assinatura_ok(_d jsonb,c jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (c->>'assinatura')::jsonb = jsonb_build_object(
  'itens',(SELECT jsonb_agg(jsonb_build_object('id',x->'id','quantidade',x->'quantidade','pesoG',x->'pesoG','tipo',x->'tipo','precoOriginal',x->'precoOriginal','precoNegociado',x->'precoNegociado','brinde',x->'brinde','desconto',x->'desconto')) FROM jsonb_array_elements(_d->'itens') x),
  'descontoGeral',_d->'descontoGeral','volumes',_d->'volumes','origem',_d->'origemCep','destino',_d->'destinoCep','endereco',_d->'endereco','declarado',_d->'declarado','provisorio',_d->'declaradoProvisorio')
$$;
-- Cálculo independente em centavos, sem aceitar totais da interface ou do servidor.
CREATE FUNCTION public.mimo_tira_totais(_d jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i jsonb; c jsonb; v jsonb; base numeric:=0; linha numeric; desconto numeric; produtos bigint; frete bigint:=0; total bigint; taxa integer;
BEGIN
 FOR i IN SELECT * FROM jsonb_array_elements(_d->'itens') LOOP
  IF (i->>'quantidade')::integer<1 OR (i->>'precoNegociado')::bigint<0 THEN RAISE EXCEPTION 'item inválido'; END IF;
  IF (i->>'brinde')::boolean THEN CONTINUE; END IF;
  linha:=(i->>'precoNegociado')::numeric*(i->>'quantidade')::numeric;
  desconto:=CASE WHEN i->'desconto'->>'modo'='fixo' THEN (i->'desconto'->>'valor')::numeric ELSE round(linha*(i->'desconto'->>'valor')::numeric/10000) END;
  IF desconto<0 OR desconto>linha THEN RAISE EXCEPTION 'desconto inválido'; END IF;
  base:=base+linha-desconto;
 END LOOP;
 desconto:=CASE WHEN _d->'descontoGeral'->>'modo'='fixo' THEN (_d->'descontoGeral'->>'valor')::numeric ELSE round(base*(_d->'descontoGeral'->>'valor')::numeric/10000) END;
 IF desconto<0 OR desconto>base THEN RAISE EXCEPTION 'desconto geral inválido'; END IF;
 produtos:=base-desconto;
 SELECT x INTO c FROM jsonb_array_elements(_d->'cotacoes') x WHERE x->>'id'=_d->>'cotacaoId' AND public.mimo_tira_assinatura_ok(_d,x) LIMIT 1;
 IF c IS NOT NULL THEN
  IF c->>'modo'='remessa' THEN frete:=(c->>'valor')::bigint;
  ELSE
   IF (SELECT count(*) FROM jsonb_object_keys(c->'valoresVolumes'))<>jsonb_array_length(_d->'volumes') THEN RAISE EXCEPTION 'frete incompleto'; END IF;
   FOR v IN SELECT * FROM jsonb_array_elements(_d->'volumes') LOOP
    IF c->'valoresVolumes'->>(v->>'id') IS NULL THEN RAISE EXCEPTION 'frete incompleto'; END IF;
    frete:=frete+(c->'valoresVolumes'->>(v->>'id'))::bigint;
   END LOOP;
  END IF;
 END IF;
 IF frete<0 THEN RAISE EXCEPTION 'frete inválido'; END IF;
 taxa:=(_d->'pagamento'->>'taxaBps')::integer;
 IF taxa<0 OR taxa>=10000 THEN RAISE EXCEPTION 'taxa inválida'; END IF;
 total:=CASE WHEN _d->'pagamento'->>'forma'='cartao' THEN ceil(produtos::numeric*10000/(10000-taxa))::bigint ELSE produtos END;
 IF _d->>'fretePagador'='cliente' THEN total:=total+frete; END IF;
 IF total<0 OR total>100000000 THEN RAISE EXCEPTION 'total inválido'; END IF;
 RETURN jsonb_build_object('total',total,'produtos',produtos,'frete',frete);
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_totais(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_totais(jsonb) TO service_role;

-- Elegibilidade operacional independente: distribuição integral, pesos, destino e cotação.
CREATE FUNCTION public.mimo_tira_pronto(_d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i jsonb; v jsonb; c jsonb; qtd bigint; peso bigint;
BEGIN
 IF jsonb_array_length(_d->'itens')=0 OR jsonb_array_length(_d->'volumes')=0 OR coalesce(_d->>'destinoCep','') !~ '^\d{8}$' OR length(trim(coalesce(_d->>'endereco','')))=0 OR coalesce(_d->>'fretePagador','') NOT IN ('mimo','cliente') THEN RETURN false; END IF;
 FOR i IN SELECT * FROM jsonb_array_elements(_d->'itens') LOOP
  SELECT coalesce(sum((ct->>'quantidade')::bigint),0) INTO qtd FROM jsonb_array_elements(_d->'volumes') vol CROSS JOIN LATERAL jsonb_array_elements(vol->'conteudo') ct WHERE ct->>'itemId'=i->>'id';
  IF qtd<>(i->>'quantidade')::bigint THEN RETURN false; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_array_elements(_d->'volumes') LOOP
  IF NOT coalesce((v->>'confirmado')::boolean,false) OR jsonb_array_length(v->'conteudo')=0 THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(v->'conteudo') LOOP
   SELECT x INTO i FROM jsonb_array_elements(_d->'itens') x WHERE x->>'id'=c->>'itemId';
   IF i IS NULL OR ((i->>'pesoG') IS NULL AND v->>'pesoAjustadoG' IS NULL) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 SELECT x INTO c FROM jsonb_array_elements(_d->'cotacoes') x WHERE x->>'id'=_d->>'cotacaoId';
 IF c IS NULL OR NOT coalesce((c->>'oficial')::boolean,false) THEN RETURN false; END IF;
 -- Comparação jsonb ignora ordem de propriedades mas exige os mesmos campos logísticos da assinatura TypeScript.
 IF NOT coalesce(public.mimo_tira_assinatura_ok(_d,c),false) THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_pronto(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_pronto(jsonb) TO service_role;

CREATE INDEX tira_pedidos_empresa_data ON public.mimo_tira_pedidos(empresa_id,updated_at DESC);
CREATE INDEX tira_pedidos_empresa_status ON public.mimo_tira_pedidos(empresa_id,status,updated_at DESC);
CREATE INDEX tira_pedidos_lead ON public.mimo_tira_pedidos(lead_id);
CREATE INDEX tira_versoes_pedido ON public.mimo_tira_versoes(empresa_id,pedido_id,versao DESC);
CREATE INDEX tira_propostas_pedido ON public.mimo_tira_propostas(empresa_id,pedido_id,created_at DESC);

-- Matriz explícita de transições (espelha src/lib/mimo-tira-regras.ts).
CREATE FUNCTION public.mimo_tira_transicao_ok(_de text,_para text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT (_de,_para) IN (('rascunho','aguardando_pagamento'),('rascunho','confirmado'),('rascunho','cancelado'),
    ('aguardando_pagamento','rascunho'),('aguardando_pagamento','confirmado'),('aguardando_pagamento','cancelado'),
    ('confirmado','rascunho'),('confirmado','aguardando_pagamento'),('confirmado','faturado'),('confirmado','cancelado'),
    ('faturado','enviado'),('faturado','cancelado'),('enviado','entregue'))
$$;

CREATE FUNCTION public.mimo_tira_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l public.mimo_leads; recebido bigint; totais jsonb; d jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'pedidos não podem ser apagados'; END IF;
  -- Cotações antigas continuam no histórico, mas não podem compor os totais atuais.
  d:=NEW.documento;
  totais:=public.mimo_tira_totais(d);
  IF (NEW.total,NEW.produtos,NEW.frete) IS DISTINCT FROM ((totais->>'total')::bigint,(totais->>'produtos')::bigint,(totais->>'frete')::bigint) THEN RAISE EXCEPTION 'totais financeiros inconsistentes'; END IF;
  IF NEW.status NOT IN ('rascunho','cancelado') AND NOT public.mimo_tira_pronto(d) THEN RAISE EXCEPTION 'pedido incompleto ou cotação desatualizada'; END IF;
  SELECT * INTO l FROM public.mimo_leads WHERE id=NEW.lead_id;
  IF l.empresa_id IS DISTINCT FROM NEW.empresa_id THEN RAISE EXCEPTION 'cliente de outra empresa'; END IF;
  IF NEW.documento->>'leadId' IS DISTINCT FROM NEW.lead_id::text OR NEW.documento->>'status' IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'documento inconsistente'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.empresa_id<>OLD.empresa_id OR NEW.lead_id<>OLD.lead_id OR NEW.numero<>OLD.numero OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'identidade imutável'; END IF;
    IF OLD.status IN ('entregue','cancelado') THEN RAISE EXCEPTION 'pedido encerrado'; END IF;
    IF NEW.status<>OLD.status AND NOT public.mimo_tira_transicao_ok(OLD.status,NEW.status) THEN RAISE EXCEPTION 'transição não permitida'; END IF;
    IF OLD.status NOT IN ('rascunho','aguardando_pagamento','confirmado') AND (NEW.documento - 'status' - 'pagamento')<>(OLD.documento - 'status' - 'pagamento') THEN RAISE EXCEPTION 'valores comerciais bloqueados após faturamento'; END IF;
    IF OLD.status NOT IN ('rascunho','aguardando_pagamento','confirmado') AND (NEW.total,NEW.produtos,NEW.frete)<>(OLD.total,OLD.produtos,OLD.frete) THEN RAISE EXCEPTION 'valores comerciais bloqueados após faturamento'; END IF;
  END IF;
  IF NEW.status IN ('faturado','enviado','entregue') AND NEW.documento->'pagamento'->>'forma'='pix' AND NEW.pix IS NULL THEN RAISE EXCEPTION 'PIX não confirmado'; END IF;
  IF NEW.status IN ('faturado','enviado','entregue') AND NEW.documento->'pagamento'->>'faturadoEm' IS NULL THEN RAISE EXCEPTION 'faturamento obrigatório'; END IF;
  IF NEW.status NOT IN ('rascunho','cancelado') AND coalesce(NEW.documento->>'fretePagador','') NOT IN ('mimo','cliente') THEN RAISE EXCEPTION 'responsabilidade do frete obrigatória'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.recebimentos) r WHERE coalesce(r->>'valor','') !~ '^\d+$' OR (r->>'valor')::numeric<=0 OR r->>'usuarioId' IS NULL OR r->>'confirmadoEm' IS NULL) THEN RAISE EXCEPTION 'recebimento inválido'; END IF;
  SELECT coalesce(sum((r->>'valor')::bigint),0) INTO recebido FROM jsonb_array_elements(NEW.recebimentos) r;
  IF recebido>NEW.total THEN RAISE EXCEPTION 'total inferior aos recebimentos'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tira_guard BEFORE INSERT OR UPDATE OR DELETE ON public.mimo_tira_pedidos FOR EACH ROW EXECUTE FUNCTION public.mimo_tira_guard();

CREATE FUNCTION public.mimo_tira_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'histórico imutável'; END $$;
CREATE TRIGGER tira_versoes_imutavel BEFORE UPDATE OR DELETE ON public.mimo_tira_versoes FOR EACH ROW EXECUTE FUNCTION public.mimo_tira_imutavel();
CREATE TRIGGER tira_propostas_imutavel BEFORE UPDATE OR DELETE ON public.mimo_tira_propostas FOR EACH ROW EXECUTE FUNCTION public.mimo_tira_imutavel();
CREATE TRIGGER tira_config_hist_imutavel BEFORE UPDATE OR DELETE ON public.mimo_tira_config_historico FOR EACH ROW EXECUTE FUNCTION public.mimo_tira_imutavel();

-- Bloqueia membro/lead durante a operação; vendedor só atua no próprio cliente.
CREATE FUNCTION public.mimo_tira_ator(_empresa uuid,_ator uuid,_lead uuid,_gestao boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.empresa_membros; l public.mimo_leads;
BEGIN
  PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo FOR UPDATE;
  IF m.id IS NULL OR (_gestao AND m.papel NOT IN ('administrador','gestor')) THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  IF _lead IS NOT NULL THEN
    SELECT * INTO l FROM public.mimo_leads WHERE id=_lead AND empresa_id=_empresa FOR UPDATE;
    IF l.id IS NULL OR (m.papel='vendedor' AND l.responsavel_id IS DISTINCT FROM _ator) THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN m.papel::text;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_ator(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_ator(uuid,uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.mimo_tira_versionar(p public.mimo_tira_pedidos,_ator uuid,_acao text,_detalhes jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.mimo_tira_versoes(empresa_id,pedido_id,versao,documento,snapshot,detalhes,autor_id,acao)
  VALUES(p.empresa_id,p.id,p.versao,p.documento,jsonb_build_object('status',p.status,'total',p.total,'produtos',p.produtos,'frete',p.frete,'pix',p.pix,'recebimentos',p.recebimentos,'motivoCancelamento',p.motivo_cancelamento),_detalhes,_ator,_acao)
$$;
REVOKE ALL ON FUNCTION public.mimo_tira_versionar(public.mimo_tira_pedidos,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_versionar(public.mimo_tira_pedidos,uuid,text,jsonb) TO service_role;

-- Salvar/editar/restaurar: somente estados editáveis; faturado, enviado, entregue e cancelado só por mimo_tira_status.
CREATE FUNCTION public.mimo_tira_salvar(_empresa uuid,_ator uuid,_id uuid,_versao integer,_documento jsonb,_total bigint,_produtos bigint,_frete bigint,_origem integer DEFAULT NULL)
RETURNS public.mimo_tira_pedidos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mimo_tira_pedidos; l public.mimo_leads; novo text:=_documento->>'status';
BEGIN
  PERFORM public.mimo_tira_ator(_empresa,_ator,(_documento->>'leadId')::uuid,false);
  IF novo NOT IN ('rascunho','aguardando_pagamento','confirmado') THEN RAISE EXCEPTION 'estado exige ação própria' USING ERRCODE='42501'; END IF;
  SELECT * INTO l FROM public.mimo_leads WHERE id=(_documento->>'leadId')::uuid;
  _documento:=_documento||jsonb_build_object('cliente',l.nome_empresa,'responsavelId',l.responsavel_id);
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id FOR UPDATE;
  IF p.id IS NULL THEN
    IF _versao<>0 THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    INSERT INTO public.mimo_tira_pedidos(id,empresa_id,lead_id,documento,total,produtos,frete,status)
      VALUES(_id,_empresa,l.id,_documento,_total,_produtos,_frete,novo) RETURNING * INTO p;
  ELSE
    IF p.empresa_id<>_empresa OR p.lead_id<>l.id THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
    IF p.versao<>_versao THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    IF p.status NOT IN ('rascunho','aguardando_pagamento','confirmado') THEN RAISE EXCEPTION 'edição bloqueada' USING ERRCODE='42501'; END IF;
    UPDATE public.mimo_tira_pedidos SET documento=_documento,total=_total,produtos=_produtos,frete=_frete,status=novo,
      pix=CASE WHEN _total<>p.total OR _documento->'pagamento'->>'forma' IS DISTINCT FROM p.documento->'pagamento'->>'forma' THEN NULL ELSE p.pix END,
      versao=p.versao+1,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
  END IF;
  PERFORM public.mimo_tira_versionar(p,_ator,CASE WHEN _origem IS NOT NULL THEN 'restaurar' ELSE 'salvar' END,jsonb_build_object('versaoOrigem',_origem));
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_salvar(uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_salvar(uuid,uuid,uuid,integer,jsonb,bigint,bigint,bigint,integer) TO service_role;

-- Mudança de estado: registra usuário, data/hora, estado anterior e novo.
CREATE FUNCTION public.mimo_tira_status(_empresa uuid,_ator uuid,_id uuid,_versao integer,_status text,_motivo text,_faturado text)
RETURNS public.mimo_tira_pedidos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mimo_tira_pedidos; papel text; anterior text;
BEGIN
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id AND empresa_id=_empresa FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  papel:=public.mimo_tira_ator(_empresa,_ator,p.lead_id,_status IN ('faturado','enviado','entregue','cancelado'));
  IF p.versao<>_versao THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
  IF NOT public.mimo_tira_transicao_ok(p.status,_status) THEN RAISE EXCEPTION 'transição não permitida'; END IF;
  IF _status='cancelado' AND length(trim(coalesce(_motivo,'')))<5 THEN RAISE EXCEPTION 'motivo obrigatório'; END IF;
  IF _status='faturado' AND (_faturado IS NULL OR _faturado !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'faturamento obrigatório'; END IF;
  IF _status='faturado' THEN PERFORM _faturado::date; END IF;
  anterior:=p.status;
  UPDATE public.mimo_tira_pedidos SET status=_status,
    documento=jsonb_set(jsonb_set(documento,'{status}',to_jsonb(_status)),'{pagamento,faturadoEm}',CASE WHEN _status='faturado' THEN to_jsonb(_faturado) ELSE coalesce(documento->'pagamento'->'faturadoEm','null'::jsonb) END),
    cancelado_em=CASE WHEN _status='cancelado' THEN clock_timestamp() END, cancelado_por=CASE WHEN _status='cancelado' THEN _ator END,
    motivo_cancelamento=CASE WHEN _status='cancelado' THEN trim(_motivo) END,
    versao=p.versao+1,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
  PERFORM public.mimo_tira_versionar(p,_ator,'status',jsonb_build_object('de',anterior,'para',_status,'papel',papel,'motivo',CASE WHEN _status='cancelado' THEN trim(_motivo) END));
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_status(uuid,uuid,uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_status(uuid,uuid,uuid,integer,text,text,text) TO service_role;

-- Recebimento manual: somente administrador/gestor; operação idempotente só com o mesmo valor.
CREATE FUNCTION public.mimo_tira_receber(_empresa uuid,_ator uuid,_id uuid,_versao integer,_operacao text,_valor bigint)
RETURNS public.mimo_tira_pedidos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mimo_tira_pedidos; r jsonb; recebido bigint; existente jsonb;
BEGIN
  IF _operacao IS NULL OR _operacao !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'operação inválida'; END IF;
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id AND empresa_id=_empresa FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  PERFORM public.mimo_tira_ator(_empresa,_ator,p.lead_id,true);
  SELECT x INTO existente FROM jsonb_array_elements(p.recebimentos) x WHERE x->>'operacao'=_operacao;
  IF existente IS NOT NULL THEN
    IF (existente->>'valor')::bigint<>_valor THEN RAISE EXCEPTION 'operação repetida com valor diferente'; END IF;
    RETURN p;
  END IF;
  IF p.versao<>_versao THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
  SELECT coalesce(sum((x->>'valor')::bigint),0) INTO recebido FROM jsonb_array_elements(p.recebimentos) x;
  IF p.status IN ('cancelado','entregue') OR _valor<=0 OR recebido>=p.total OR recebido+_valor>p.total THEN RAISE EXCEPTION 'recebimento inválido'; END IF;
  IF p.documento->'pagamento'->>'forma'='pix' AND recebido+_valor<>p.total THEN RAISE EXCEPTION 'PIX antecipado integral'; END IF;
  r=jsonb_build_object('operacao',_operacao,'valor',_valor,'usuarioId',_ator,'confirmadoEm',clock_timestamp());
  UPDATE public.mimo_tira_pedidos SET recebimentos=p.recebimentos||jsonb_build_array(r),pix=CASE WHEN p.documento->'pagamento'->>'forma'='pix' THEN r ELSE p.pix END,
    versao=p.versao+1,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
  PERFORM public.mimo_tira_versionar(p,_ator,'recebimento',r);
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_receber(uuid,uuid,uuid,integer,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_receber(uuid,uuid,uuid,integer,text,bigint) TO service_role;

-- Configurações: admin/gestor; produtos nunca removidos; cada gravação vai ao histórico permanente.
CREATE FUNCTION public.mimo_tira_configurar(_empresa uuid,_ator uuid,_versao text,_catalogo jsonb,_modelos jsonb,_taxas jsonb,_brindes jsonb,_caixas jsonb)
RETURNS public.mimo_tira_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.mimo_tira_config;
BEGIN
  PERFORM public.mimo_tira_ator(_empresa,_ator,NULL,true);
  IF jsonb_typeof(_catalogo)<>'array' OR jsonb_typeof(_modelos)<>'array' OR jsonb_typeof(_taxas)<>'array' OR jsonb_array_length(_taxas)<>12
     OR jsonb_typeof(_brindes)<>'array' OR jsonb_typeof(_caixas)<>'array' OR jsonb_array_length(_caixas)<1 THEN RAISE EXCEPTION 'configuração inválida'; END IF;
  SELECT * INTO c FROM public.mimo_tira_config WHERE empresa_id=_empresa FOR UPDATE;
  IF c.empresa_id IS NULL THEN
    IF _versao IS NOT NULL THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    INSERT INTO public.mimo_tira_config(empresa_id,catalogo,modelos,taxas,brindes,caixas) VALUES(_empresa,_catalogo,_modelos,_taxas,_brindes,_caixas) RETURNING * INTO c;
  ELSE
    IF _versao IS NULL OR c.updated_at<>_versao::timestamptz THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(c.catalogo) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_catalogo) b WHERE b->>'codigo'=a->>'codigo')) THEN RAISE EXCEPTION 'produtos não podem ser removidos'; END IF;
    UPDATE public.mimo_tira_config SET catalogo=_catalogo,modelos=_modelos,taxas=_taxas,brindes=_brindes,caixas=_caixas,updated_at=clock_timestamp() WHERE empresa_id=_empresa RETURNING * INTO c;
  END IF;
  INSERT INTO public.mimo_tira_config_historico(empresa_id,config,autor_id) VALUES(_empresa,to_jsonb(c),_ator);
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_configurar(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_configurar(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb) TO service_role;

-- Emissão: numeração MIMO-<pedido>-V<versão>-<sequência>, somente da versão atual e sem custo interno.
CREATE FUNCTION public.mimo_tira_proposta(_empresa uuid,_ator uuid,_id uuid,_versao integer,_pedido uuid,_arquivo text,_hash text,_documento jsonb)
RETURNS TABLE(id uuid,numero text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mimo_tira_pedidos; seq integer; n text;
BEGIN
  SELECT * INTO p FROM public.mimo_tira_pedidos x WHERE x.id=_pedido AND x.empresa_id=_empresa FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  PERFORM public.mimo_tira_ator(_empresa,_ator,p.lead_id,false);
  IF p.versao<>_versao THEN RAISE EXCEPTION 'conflito' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_documento->'itens') i WHERE i->'custoInterno' IS NOT NULL AND i->'custoInterno'<>'null'::jsonb) THEN RAISE EXCEPTION 'custo interno não pode ser emitido'; END IF;
  SELECT coalesce(max(sequencia),0)+1 INTO seq FROM public.mimo_tira_propostas WHERE pedido_id=_pedido AND versao=_versao;
  n:='MIMO-'||lpad(p.numero::text,6,'0')||'-V'||_versao||'-'||lpad(seq::text,2,'0');
  INSERT INTO public.mimo_tira_propostas(id,empresa_id,pedido_id,versao,sequencia,numero,documento,arquivo,hash,autor_id)
    VALUES(_id,_empresa,_pedido,_versao,seq,n,_documento,_arquivo,_hash,_ator);
  RETURN QUERY SELECT _id,n;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_proposta(uuid,uuid,uuid,integer,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_proposta(uuid,uuid,uuid,integer,uuid,text,text,jsonb) TO service_role;

-- ARMAZENAMENTO PRIVADO (etapa separada, também bloqueada): criar o bucket privado
-- "mimo-propostas" pela ferramenta de armazenamento (nunca público) e só então aplicar:
-- CREATE POLICY mimo_propostas_read ON storage.objects FOR SELECT TO authenticated USING (
--   bucket_id='mimo-propostas' AND EXISTS(SELECT 1 FROM public.mimo_tira_propostas pr WHERE pr.arquivo=storage.objects.name));
-- Escrita no bucket somente pelo servidor após mimo_tira_proposta; a leitura herda o RLS da proposta/pedido.

-- Reversão: remover a navegação/ativação (MIMO_TIRA_PERSISTENCIA) e manter as estruturas, já service-only.
-- Não apagar pedidos, versões, propostas nem histórico. Sem DROP, alteração legada, backfill ou dados de teste.
