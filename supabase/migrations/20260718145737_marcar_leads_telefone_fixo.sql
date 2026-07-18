-- Marca como 'sem_numero' leads com status 'novo' cujo whatsapp/telefone
-- está em formato de fixo BR (DDD + 8 dígitos, sem o 9º dígito de celular).
-- Esses números nunca terão WhatsApp e geraram disparos de campanha que
-- contribuíram para uma restrição temporária de conta pela Meta/WhatsApp.
-- Só toca status='novo' — não sobrescreve leads que já avançaram no funil
-- (contatado/respondeu/negociacao/fechado/perdido).
WITH candidatos AS (
  SELECT
    id,
    history,
    CASE
      WHEN regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g') ~ '^55'
       AND length(regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g')) >= 12
      THEN substring(regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g') from 3)
      ELSE regexp_replace(coalesce(whatsapp, telefone, ''), '\D', '', 'g')
    END AS local
  FROM public.leads
  WHERE status = 'novo'
    AND coalesce(whatsapp, telefone, '') <> ''
)
UPDATE public.leads l
SET
  status = 'sem_numero',
  history = coalesce(l.history, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'ts', (extract(epoch from now()) * 1000)::bigint,
      'text', 'Migration — telefone fixo detectado (sem 9º dígito), marcado como sem_numero'
    )
  )
FROM candidatos c
WHERE l.id = c.id
  AND length(c.local) = 10;
