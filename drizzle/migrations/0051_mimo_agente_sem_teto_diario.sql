-- Remove the shared daily generation cap without reopening any conversation.
DO $patch$
DECLARE
  worker_def text;
  retomada_def text;
  worker_sem_teto text;
  retomada_sem_teto text;
  limite_worker text := $trecho$
   OR (SELECT coalesce(sum(geracoes),0) FROM public.mimo_agente_fila WHERE empresa_id=c.empresa_id AND inicio_em>=date_trunc('day',clock_timestamp()))>=coalesce((v->>'limiteDiario')::int,100) THEN$trecho$;
  limite_retomada text := $trecho$ SELECT greatest(0,least(_limite,coalesce((config_publicada->>'limiteDiario')::int,100)
   - coalesce(sum(geracoes),0)::int - 10)) INTO capacidade
 FROM mimo_agente_fila WHERE empresa_id=_empresa AND inicio_em>=date_trunc('day',now());$trecho$;
BEGIN
  SELECT pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure) INTO worker_def;
  SELECT pg_get_functiondef('public.mimo_retomada_agendar(uuid,uuid,timestamptz,integer)'::regprocedure) INTO retomada_def;

  worker_sem_teto := replace(worker_def, limite_worker, ' THEN');
  retomada_sem_teto := replace(retomada_def, limite_retomada, ' capacidade := _limite;');

  IF worker_sem_teto = worker_def OR retomada_sem_teto = retomada_def
    OR position('limiteDiario' IN worker_sem_teto) <> 0
    OR position('limiteDiario' IN retomada_sem_teto) <> 0
    OR position('maxMensagens' IN worker_sem_teto) = 0
    OR position('maxMensagens' IN retomada_sem_teto) = 0
    OR position('LIMIT capacidade FOR UPDATE OF l SKIP LOCKED' IN retomada_sem_teto) = 0 THEN
    RAISE EXCEPTION 'As regras de limites do agente ou da retomada mudaram; confira as definições.';
  END IF;

  EXECUTE worker_sem_teto;
  EXECUTE retomada_sem_teto;
END
$patch$;
