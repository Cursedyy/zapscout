-- Preparada, não aplicada. Usar o migrador oficial após autorização.
-- Corpos vigentes conferidos por pg_get_functiondef; CREATE OR REPLACE preserva as ACLs.
-- Os bloqueios de transição, completude, data e PIX no banco permanecem inalterados.

CREATE OR REPLACE FUNCTION public.mimo_tira_status(_empresa uuid, _ator uuid, _id uuid, _versao integer, _status text, _motivo text, _faturado text)
 RETURNS public.mimo_tira_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.mimo_tira_pedidos; papel text; anterior text;
BEGIN
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id AND empresa_id=_empresa FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  papel:=public.mimo_tira_ator(_empresa,_ator,p.lead_id,_status IN ('faturado','enviado','entregue','cancelado'));
  IF _status IN ('enviado','entregue','cancelado') AND papel NOT IN ('administrador','gestor') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501';
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.mimo_tira_receber(_empresa uuid, _ator uuid, _id uuid, _versao integer, _operacao text, _valor bigint)
 RETURNS public.mimo_tira_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.mimo_tira_pedidos; r jsonb; recebido bigint; existente jsonb;
BEGIN
  IF _operacao IS NULL OR _operacao !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'operação inválida'; END IF;
  SELECT * INTO p FROM public.mimo_tira_pedidos WHERE id=_id AND empresa_id=_empresa FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  IF public.mimo_tira_ator(_empresa,_ator,p.lead_id,true) NOT IN ('administrador','gestor') THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501';
  END IF;
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
END $function$;
