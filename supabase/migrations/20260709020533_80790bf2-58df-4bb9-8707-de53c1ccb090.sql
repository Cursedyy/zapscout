UPDATE public.envios_manuais_fila
SET
  status = 'pendente',
  tentativas = 0,
  agendado_para = GREATEST(now() + interval '5 minutes', agendado_para),
  ultimo_erro = 'WhatsApp desconectado no provedor — reconecte o número para a fila continuar.'
WHERE status IN ('pendente', 'falha')
  AND (
    ultimo_erro ILIKE '%WhatsApp disconnected%'
    OR ultimo_erro ILIKE '%session is not reconnectable%'
    OR ultimo_erro ILIKE '%WA_NAO_CONECTADO%'
    OR ultimo_erro ILIKE '%not connected%'
    OR ultimo_erro ILIKE '%disconnected%'
  );

UPDATE public.profiles
SET uazapi_instance_status = 'disconnected'
WHERE id IN (
  SELECT DISTINCT user_id
  FROM public.envios_manuais_fila
  WHERE ultimo_erro = 'WhatsApp desconectado no provedor — reconecte o número para a fila continuar.'
)
AND wa_provider IN ('uazapi', 'evolution');