ALTER TABLE public.mimo_vendas_mensais
  ADD COLUMN ajustes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(ajustes) = 'object');
--> statement-breakpoint
CREATE FUNCTION public.mimo_vendas_definir_valor(
  _empresa uuid, _competencia date, _dia date, _esperado bigint, _valor bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  registro public.mimo_vendas_mensais;
  chave text;
  inicial bigint;
  atual bigint;
BEGIN
  PERFORM 1 FROM public.empresas e JOIN public.empresa_membros m ON m.empresa_id=e.id
    WHERE e.id=_empresa AND e.slug='mimo' AND e.ativa AND m.ativo
      AND m.user_id=(SELECT auth.uid()) AND m.papel IN ('administrador','gestor')
    FOR SHARE OF e,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  IF _valor IS NULL OR _valor NOT BETWEEN 0 AND 999999999999 OR _esperado IS NULL OR _esperado < 0
    THEN RAISE EXCEPTION 'Valor inválido' USING ERRCODE='22023'; END IF;
  SELECT * INTO STRICT registro FROM public.mimo_vendas_mensais
    WHERE empresa_id=_empresa AND competencia=_competencia FOR UPDATE;
  IF _dia IS NULL THEN
    chave := 'meta';
    inicial := (registro.demonstrativo #>> '{total,orcado}')::bigint;
  ELSE
    IF date_trunc('month', _dia)::date <> _competencia THEN RAISE EXCEPTION 'Dia fora da competência' USING ERRCODE='22023'; END IF;
    chave := to_char(_dia, 'YYYY-MM-DD');
    SELECT (d->>'realizado')::bigint INTO STRICT inicial
      FROM jsonb_array_elements(registro.demonstrativo->'semanas') s,
           jsonb_array_elements(s->'dias') d WHERE d->>'data'=chave;
  END IF;
  atual := coalesce((registro.ajustes->>chave)::bigint, inicial);
  IF atual IS DISTINCT FROM _valor THEN
    IF atual IS DISTINCT FROM _esperado THEN RAISE EXCEPTION 'Valor alterado por outra pessoa' USING ERRCODE='40001'; END IF;
    UPDATE public.mimo_vendas_mensais
      SET ajustes=CASE WHEN _valor=inicial THEN ajustes-chave ELSE jsonb_set(ajustes, ARRAY[chave], to_jsonb(_valor)) END
      WHERE empresa_id=_empresa AND competencia=_competencia RETURNING * INTO registro;
  END IF;
  RETURN jsonb_build_object('competencia', registro.competencia, 'demonstrativo', registro.demonstrativo, 'ajustes', registro.ajustes);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mimo_vendas_definir_valor(uuid,date,date,bigint,bigint) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mimo_vendas_definir_valor(uuid,date,date,bigint,bigint) TO authenticated;
