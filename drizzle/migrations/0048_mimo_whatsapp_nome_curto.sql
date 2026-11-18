-- A one-character WhatsApp display name must not prevent ingestion. Preserve the
-- exact contact name; use the canonical phone only as the initial CRM display name.
DO $patch$
DECLARE anterior text; atual text;
BEGIN
 SELECT pg_get_functiondef('public.mimo_receber_whatsapp_comercial(uuid,uuid,text,text,text,text,text,timestamptz,boolean)'::regprocedure) INTO anterior;
 atual:=replace(anterior,'coalesce(nullif(left(btrim(_nome),200),''''),n)',
   'CASE WHEN length(btrim(coalesce(_nome,'''')))>=2 THEN left(btrim(_nome),200) ELSE n END');
 IF anterior=atual THEN RAISE EXCEPTION 'Recebimento incompatível: validação de nome ausente'; END IF;
 EXECUTE atual;
END $patch$;
