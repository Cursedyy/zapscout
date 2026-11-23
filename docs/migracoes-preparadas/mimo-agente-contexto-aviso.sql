-- Acrescenta apenas os campos usados no aviso ao retorno da reserva já autorizada.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  _definicao text := pg_catalog.pg_get_functiondef('public.mimo_quentes_operar(text,jsonb)'::regprocedure);
  _antes text := $antes$CASE WHEN n.encaminhamento_fila_id IS NOT NULL THEN n.encaminhamento ELSE to_jsonb(sinal) END);$antes$;
  _depois text := $depois$CASE WHEN n.encaminhamento_fila_id IS NOT NULL THEN n.encaminhamento ELSE to_jsonb(sinal) END,
    'dados_encaminhamento', (
      SELECT jsonb_strip_nulls(jsonb_build_object(
        'nome', f.resultado #> '{dados,nome}',
        'cidade_uf', f.resultado #> '{dados,cidade_uf}',
        'estabelecimento', f.resultado #> '{dados,estabelecimento}',
        'revenda', f.resultado #> '{dados,revenda}',
        'necessidade', f.resultado #> '{dados,necessidade}',
        'problema', f.resultado #> '{dados,problema}'
      ))
      FROM public.mimo_agente_fila f
      JOIN public.mimo_agente_conversas cv ON cv.id = f.conversa_id
        AND cv.empresa_id = n.empresa_id AND cv.lead_id = n.lead_id
      WHERE f.id = n.encaminhamento_fila_id AND f.empresa_id = n.empresa_id
        AND f.estado = 'enviada' AND f.resultado->>'estado' = 'humano'
    ));$depois$;
BEGIN
  IF strpos(_definicao, _depois) > 0 THEN
    RETURN;
  END IF;
  IF strpos(_definicao, _antes) = 0 OR
     length(_definicao) - length(replace(_definicao, _antes, '')) <> length(_antes) THEN
    RAISE EXCEPTION 'A reserva do aviso mudou. Revise a inclusão do contexto antes de aplicar.';
  END IF;
  EXECUTE replace(_definicao, _antes, _depois);
END;
$migration$;

COMMIT;
