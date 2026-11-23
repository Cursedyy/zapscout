-- Corrige os dois literais usados ao salvar e devolver a transcrição.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  _definicao text := pg_catalog.pg_get_functiondef('public.mimo_agente_audio(jsonb)'::regprocedure);
  _corrompido text := U&'[Transcri\00C3\00A7\00C3\00A3o de \00C3\00A1udio]';
  _correto text := U&'[Transcri\00E7\00E3o de \00E1udio]';
  _ocorrencias_antigas integer := (length(_definicao) - length(replace(_definicao, _corrompido, ''))) / length(_corrompido);
  _ocorrencias_corretas integer := (length(_definicao) - length(replace(_definicao, _correto, ''))) / length(_correto);
BEGIN
  IF _ocorrencias_antigas = 0 AND _ocorrencias_corretas = 2 THEN
    RETURN;
  END IF;
  IF _ocorrencias_antigas <> 2 OR _ocorrencias_corretas <> 0 THEN
    RAISE EXCEPTION 'A definição do marcador de áudio mudou. Revise antes de aplicar.';
  END IF;
  EXECUTE replace(_definicao, _corrompido, _correto);
END;
$migration$;

COMMIT;
