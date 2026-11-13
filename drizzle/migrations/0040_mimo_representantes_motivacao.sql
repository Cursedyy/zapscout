-- Keep previous registrations and in-flight clients compatible; require an answer in the new public schema.
ALTER TABLE public.mimo_representantes ADD COLUMN motivacao text
 CHECK (motivacao IS NULL OR length(trim(motivacao)) BETWEEN 1 AND 2000);
CREATE OR REPLACE FUNCTION public.mimo_inscrever_representante(p_dados jsonb, p_ip_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e uuid;n integer;novo uuid;
BEGIN
 IF p_ip_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid request';END IF;
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 IF e IS NULL THEN RAISE EXCEPTION 'Unavailable';END IF;
 INSERT INTO public.mimo_representantes_limites(ip_hash,janela,tentativas) VALUES(p_ip_hash,date_trunc('hour',now()),1)
 ON CONFLICT(ip_hash,janela) DO UPDATE SET tentativas=mimo_representantes_limites.tentativas+1 RETURNING tentativas INTO n;
 DELETE FROM public.mimo_representantes_limites WHERE janela<now()-interval '2 days';
 IF n>30 THEN RETURN '"limite"'::jsonb;END IF;
 INSERT INTO public.mimo_representantes(empresa_id,nome,email,whatsapp,cidade,uf,regiao_atuacao,experiencia,segmentos,carteira_clientes,marcas_atuais,core,disponibilidade,motivacao,consentimento)
 VALUES(e,trim(p_dados->>'nome'),p_dados->>'email',p_dados->>'whatsapp',trim(p_dados->>'cidade'),p_dados->>'uf',trim(p_dados->>'regiao_atuacao'),p_dados->>'experiencia',
 CASE WHEN jsonb_typeof(p_dados->'segmentos')='array' THEN ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_dados->'segmentos')) ELSE NULL END,
 (p_dados->>'carteira_clientes')::integer,coalesce(p_dados->>'marcas_atuais',''),p_dados->>'core',p_dados->>'disponibilidade',trim(p_dados->>'motivacao'),(p_dados->>'consentimento')::boolean)
 ON CONFLICT DO NOTHING RETURNING id INTO novo;
 IF novo IS NULL THEN RETURN '"duplicado"'::jsonb;END IF;RETURN '"recebido"'::jsonb;
END $function$;
NOTIFY pgrst,'reload schema';
