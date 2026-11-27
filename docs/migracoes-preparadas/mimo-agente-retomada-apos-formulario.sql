-- Prepared only. Verify backup and apply through the official migrator before publishing.
-- A conversation paused after the official representative/influencer form is resumed when the
-- same lead writes again with real content (e.g. clicked a distributor ad). Plain thanks/acks
-- ("ok", "obrigado", emojis) keep it paused. The automatic sem_perfil disqualification is reverted
-- so the reopened commercial lead is visible again; manual losses and other reasons are untouched.
-- Automatic follow-ups stay blocked (followup_bloqueado is sticky by design).
DO $patch$
DECLARE
  entrada text := pg_get_functiondef('public.mimo_agente_enfileirar(uuid,uuid,text,text,text)'::regprocedure);
  ancora constant text := $m$IF c.estado<>'agente' OR cfg.modo='desativado' OR v IS NULL THEN RETURN; END IF;$m$;
BEGIN
  IF position('retomada_lead' IN entrada) > 0 THEN RETURN; END IF;
  IF (length(entrada)-length(replace(entrada,ancora,''))) <> length(ancora) THEN
    RAISE EXCEPTION 'Definição de mimo_agente_enfileirar incompatível com a retomada após formulário';
  END IF;
  EXECUTE replace(entrada,ancora,$new$IF c.estado='pausada' AND c.motivo IN ('representacao','parceria_influencia')
   AND cfg.modo<>'desativado' AND v IS NOT NULL
   AND btrim(regexp_replace(lower(coalesce(_texto,'')),'[^a-z0-9áàâãéêíóôõúç ]+',' ','g')) !~
     '^((ok|okay|obrigad[oa]s?|obg|brigad[oa]|valeu|vlw|blz|beleza|certo|ta|tá|bom|boa|show|perfeito|entendi|combinado|joia|jóia|sim|muito|grat[oa]|disponha|tchau|abraços?|deus|abençoe|amém|amem)\s*)*$' THEN
  UPDATE public.mimo_agente_conversas SET estado='agente',motivo='retomada_lead',updated_at=clock_timestamp()
   WHERE id=c.id;
  IF NOT c.piloto THEN
   UPDATE public.mimo_leads SET etapa='contato_realizado',qualificacao='pendente',motivo_perda_codigo=NULL
    WHERE empresa_id=c.empresa_id AND id=c.lead_id AND etapa='perdido' AND qualificacao='nao_qualificado'
      AND motivo_perda_codigo='sem_perfil';
  END IF;
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados)
   VALUES(c.empresa_id,c.id,'retomada_lead',jsonb_build_object('evento',_evento,'motivoAnterior',c.motivo));
  c.estado := 'agente';
 END IF;
 $new$||ancora);
END $patch$;
