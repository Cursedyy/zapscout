-- PREPARADO, NÃO APLICADO. Exige backup recuperável verificado e aplicação pelo migrador oficial.
-- Brindes externos manuais (brinde sem código) e reutilizáveis BR:* marcados com envioSeparado
-- ficam fora da remessa principal. Produtos próprios bonificados continuam na logística normal.

CREATE OR REPLACE FUNCTION public.mimo_tira_envio_separado(i jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce((i->>'brinde')::boolean,false)
 AND (coalesce(i->>'codigo','')='' OR (
   coalesce(i->>'codigo','') LIKE 'BR:%'
   AND coalesce((i->>'envioSeparado')::boolean,false)
 ))
$$;
REVOKE ALL ON FUNCTION public.mimo_tira_envio_separado(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_envio_separado(jsonb) TO service_role;

-- Equivalente ao domínio TypeScript: retira os envios separados, elimina volumes que ficam
-- vazios por causa deles e invalida peso/confirmação somente nos volumes mistos restantes.
CREATE OR REPLACE FUNCTION public.mimo_tira_volumes_principais(_d jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE v jsonb; c jsonb; i jsonb; conteudo jsonb; resultado jsonb:='[]'::jsonb; removeu boolean;
BEGIN
 FOR v IN SELECT * FROM jsonb_array_elements(_d->'volumes') LOOP
  conteudo:='[]'::jsonb; removeu:=false;
  FOR c IN SELECT * FROM jsonb_array_elements(v->'conteudo') LOOP
   SELECT x INTO i FROM jsonb_array_elements(_d->'itens') x WHERE x->>'id'=c->>'itemId' LIMIT 1;
   IF i IS NOT NULL AND public.mimo_tira_envio_separado(i) THEN
    removeu:=true;
   ELSE
    conteudo:=conteudo||jsonb_build_array(c);
   END IF;
  END LOOP;
  IF jsonb_array_length(conteudo)>0 OR jsonb_array_length(v->'conteudo')=0 THEN
   IF removeu THEN
    v:=v||jsonb_build_object('conteudo',conteudo,'pesoAjustadoG',NULL,'confirmado',false);
   ELSE
    v:=v||jsonb_build_object('conteudo',conteudo);
   END IF;
   resultado:=resultado||jsonb_build_array(v);
  END IF;
 END LOOP;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_volumes_principais(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_volumes_principais(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mimo_tira_assinatura_ok(_d jsonb,c jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (c->>'assinatura')::jsonb = jsonb_build_object(
  'itens',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x->'id','quantidade',x->'quantidade','pesoG',x->'pesoG','tipo',x->'tipo','precoOriginal',x->'precoOriginal','precoNegociado',x->'precoNegociado','brinde',x->'brinde','desconto',x->'desconto')) FROM jsonb_array_elements(_d->'itens') x WHERE NOT public.mimo_tira_envio_separado(x)),'[]'::jsonb),
  'descontoGeral',_d->'descontoGeral','volumes',public.mimo_tira_volumes_principais(_d),'origem',_d->'origemCep','destino',_d->'destinoCep','endereco',_d->'endereco','declarado',_d->'declarado','provisorio',_d->'declaradoProvisorio')
$$;
REVOKE ALL ON FUNCTION public.mimo_tira_assinatura_ok(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_assinatura_ok(jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mimo_tira_totais(_d jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i jsonb; c jsonb; v jsonb; base numeric:=0; linha numeric; desconto numeric; produtos bigint; frete bigint:=0; total bigint; taxa integer; volumes jsonb; principal boolean;
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
 volumes:=public.mimo_tira_volumes_principais(_d);
 principal:=EXISTS(SELECT 1 FROM jsonb_array_elements(_d->'itens') x WHERE NOT public.mimo_tira_envio_separado(x));
 IF principal THEN
  SELECT x INTO c FROM jsonb_array_elements(_d->'cotacoes') x WHERE x->>'id'=_d->>'cotacaoId' AND public.mimo_tira_assinatura_ok(_d,x) LIMIT 1;
 END IF;
 IF c IS NOT NULL THEN
  IF c->>'modo'='remessa' THEN frete:=(c->>'valor')::bigint;
  ELSE
   IF (SELECT count(*) FROM jsonb_object_keys(c->'valoresVolumes'))<>jsonb_array_length(volumes) THEN RAISE EXCEPTION 'frete incompleto'; END IF;
   FOR v IN SELECT * FROM jsonb_array_elements(volumes) LOOP
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

CREATE OR REPLACE FUNCTION public.mimo_tira_pronto(_d jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE i jsonb; v jsonb; c jsonb; qtd bigint; volumes jsonb; principal boolean;
BEGIN
 IF jsonb_array_length(_d->'itens')=0 OR coalesce(_d->>'destinoCep','') !~ '^\d{8}$' OR length(trim(coalesce(_d->>'endereco','')))=0 THEN RETURN false; END IF;
 principal:=EXISTS(SELECT 1 FROM jsonb_array_elements(_d->'itens') x WHERE NOT public.mimo_tira_envio_separado(x));
 IF NOT principal THEN RETURN true; END IF;
 IF coalesce(_d->>'fretePagador','') NOT IN ('mimo','cliente') THEN RETURN false; END IF;
 volumes:=public.mimo_tira_volumes_principais(_d);
 IF jsonb_array_length(volumes)=0 THEN RETURN false; END IF;
 FOR i IN SELECT * FROM jsonb_array_elements(_d->'itens') x WHERE NOT public.mimo_tira_envio_separado(x) LOOP
  SELECT coalesce(sum((ct->>'quantidade')::bigint),0) INTO qtd FROM jsonb_array_elements(volumes) vol CROSS JOIN LATERAL jsonb_array_elements(vol->'conteudo') ct WHERE ct->>'itemId'=i->>'id';
  IF qtd<>(i->>'quantidade')::bigint THEN RETURN false; END IF;
 END LOOP;
 FOR v IN SELECT * FROM jsonb_array_elements(volumes) LOOP
  IF NOT coalesce((v->>'confirmado')::boolean,false) OR jsonb_array_length(v->'conteudo')=0 THEN RETURN false; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(v->'conteudo') LOOP
   SELECT x INTO i FROM jsonb_array_elements(_d->'itens') x WHERE x->>'id'=c->>'itemId';
   IF i IS NULL OR public.mimo_tira_envio_separado(i) OR ((i->>'pesoG') IS NULL AND v->>'pesoAjustadoG' IS NULL) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 SELECT x INTO c FROM jsonb_array_elements(_d->'cotacoes') x WHERE x->>'id'=_d->>'cotacaoId';
 IF c IS NULL OR NOT coalesce((c->>'oficial')::boolean,false) THEN RETURN false; END IF;
 IF NOT coalesce(public.mimo_tira_assinatura_ok(_d,c),false) THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.mimo_tira_pronto(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_tira_pronto(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mimo_tira_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l public.mimo_leads; recebido bigint; totais jsonb; d jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'pedidos não podem ser apagados'; END IF;
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
 IF NEW.documento->'pagamento'->>'faturadoEm' IS NOT NULL THEN PERFORM (NEW.documento->'pagamento'->>'faturadoEm')::date; END IF;
 IF NEW.status IN ('faturado','enviado','entregue') AND NEW.documento->'pagamento'->>'faturadoEm' IS NULL THEN RAISE EXCEPTION 'faturamento obrigatório'; END IF;
 IF NEW.status NOT IN ('rascunho','cancelado') AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.documento->'itens') x WHERE NOT public.mimo_tira_envio_separado(x)) AND coalesce(NEW.documento->>'fretePagador','') NOT IN ('mimo','cliente') THEN RAISE EXCEPTION 'responsabilidade do frete obrigatória'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.recebimentos) r WHERE coalesce(r->>'valor','') !~ '^\d+$' OR (r->>'valor')::numeric<=0 OR r->>'usuarioId' IS NULL OR r->>'confirmadoEm' IS NULL) THEN RAISE EXCEPTION 'recebimento inválido'; END IF;
 SELECT coalesce(sum((r->>'valor')::bigint),0) INTO recebido FROM jsonb_array_elements(NEW.recebimentos) r;
 IF recebido>NEW.total THEN RAISE EXCEPTION 'total inferior aos recebimentos'; END IF;
 RETURN NEW;
END $$;
