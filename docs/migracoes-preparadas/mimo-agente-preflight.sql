-- Read-only preflight for the future production validation. No credentials or contact data.
-- Run only after the backend is available; unexpected results require review, not reinstallation.
SELECT extname, extversion FROM pg_catalog.pg_extension WHERE extname IN ('pg_cron','pg_net');
SELECT to_regclass('public.mimo_agente_config') AS config,
       to_regclass('public.mimo_agente_fila') AS fila,
       to_regclass('public.mimo_agente_conversas') AS conversas;
SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1;
SELECT count(*) AS tabelas_agente, count(*) FILTER (WHERE c.relrowsecurity) AS tabelas_com_rls
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'mimo_agente_%' AND c.relkind='r';
SELECT public AS bucket_publico,file_size_limit FROM storage.buckets WHERE id='mimo-agente-materiais';
SELECT has_function_privilege('anon','public.mimo_agente_worker(text,jsonb)','execute') AS anon_worker,
       has_function_privilege('authenticated','public.mimo_agente_worker(text,jsonb)','execute') AS usuario_worker,
       has_function_privilege('service_role','public.mimo_agente_worker(text,jsonb)','execute') AS servidor_worker;
SELECT modo,count(*) AS empresas FROM public.mimo_agente_config GROUP BY modo;
SELECT jobid,jobname,schedule,active,
       command LIKE '%net.http_post%' AS usa_http,
       command LIKE '%x-cron-secret%' AS possui_cabecalho,
       command LIKE '%/api/public/hooks/process-mimo-agente%' AS rota_agente,
       command LIKE '%/api/public/hooks/process-mimo-recuperacao%' AS rota_recuperacao,
       (command LIKE '%https://zapscout.com.br/api/public/hooks/%' OR command LIKE '%https://zapscout.lovable.app/api/public/hooks/%') AS origem_conhecida
FROM cron.job WHERE jobname IN ('mimo-recuperacao-whatsapp','mimo-agente-whatsapp');
