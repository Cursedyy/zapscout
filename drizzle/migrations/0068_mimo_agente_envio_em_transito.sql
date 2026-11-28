-- A lead message that arrives while the agent's reply is being sent ('enviando') no longer hands the
-- conversation to a person ('envio_em_transito'). It is queued and waits for that send to finish.
-- An uncertain send ('incerta') still blocks every automatic reply: nothing is ever sent twice.
DO $patch$
DECLARE
  entrada text := pg_get_functiondef('public.mimo_agente_enfileirar(uuid,uuid,text,text,text)'::regprocedure);
  worker text := pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure);
  transito constant text := $m$IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado IN ('enviando','incerta')) THEN$m$;
  pendente constant text := $m$estado='pendente' AND solicitado_por IS NULL AND executar_em<=clock_timestamp() ORDER BY executar_em LIMIT 1 FOR UPDATE SKIP LOCKED;$m$;
  estado_final constant text := $m$estado=CASE WHEN sequencia=f.sequencia AND estado='agente' THEN coalesce(f.resultado->>'estado','humano') ELSE estado END,
    motivo=CASE WHEN sequencia=f.sequencia THEN coalesce(f.resultado->>'motivo','') ELSE motivo END,$m$;
BEGIN
  IF (length(entrada)-length(replace(entrada,transito,''))) <> length(transito)
    OR (length(worker)-length(replace(worker,pendente,''))) <> length(pendente)
    OR (length(worker)-length(replace(worker,estado_final,''))) <> length(estado_final) THEN
    RAISE EXCEPTION 'Definições do atendimento incompatíveis com a fila durante o envio';
  END IF;

  -- Only an uncertain send hands the conversation over; an in-flight one just delays the next turn.
  EXECUTE replace(entrada,transito,
    $m$IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado='incerta') THEN$m$);

  -- A queued turn waits while the same conversation still has a reply in flight. A stale send is
  -- turned into 'incerta' (and the conversation into 'humano') above, which then cancels the turn.
  worker := replace(worker,pendente,
    $m$estado='pendente' AND solicitado_por IS NULL AND executar_em<=clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_fila e WHERE e.conversa_id=mimo_agente_fila.conversa_id AND e.estado='enviando')
    ORDER BY executar_em LIMIT 1 FOR UPDATE SKIP LOCKED;$m$);
  -- A handoff that was already sent still applies when the lead wrote during the send.
  worker := replace(worker,estado_final,
    $m$estado=CASE WHEN estado='agente' AND (sequencia=f.sequencia OR coalesce(f.resultado->>'estado','humano')<>'agente')
      THEN coalesce(f.resultado->>'estado','humano') ELSE estado END,
    motivo=CASE WHEN sequencia=f.sequencia OR (estado='agente' AND coalesce(f.resultado->>'estado','humano')<>'agente')
      THEN coalesce(f.resultado->>'motivo','') ELSE motivo END,$m$);
  EXECUTE worker;
END $patch$;
