INSERT INTO public.funnel_events (user_id, event_name, source, created_at)
SELECT u.id, 'email_confirmed', 'database', COALESCE(u.email_confirmed_at, u.created_at)
FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.funnel_events f
    WHERE f.user_id = u.id AND f.event_name = 'email_confirmed'
  );

INSERT INTO public.funnel_events (user_id, event_name, source, created_at)
SELECT l.user_id, 'first_lead', 'database', min(l.created_at)
FROM public.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM public.funnel_events f
  WHERE f.user_id = l.user_id AND f.event_name = 'first_lead'
)
GROUP BY l.user_id;

INSERT INTO public.funnel_events (user_id, event_name, source, created_at)
SELECT m.user_id, 'first_message_sent', 'database', min(m.enviado_em)
FROM public.mensagens_enviadas m
WHERE m.status = 'enviado'
  AND NOT EXISTS (
    SELECT 1 FROM public.funnel_events f
    WHERE f.user_id = m.user_id AND f.event_name = 'first_message_sent'
  )
GROUP BY m.user_id;

INSERT INTO public.funnel_events (user_id, event_name, source, created_at)
SELECT u.user_id, 'whatsapp_connected', 'database', min(COALESCE(u.conectado_em, u.created_at))
FROM public.uazapi_instancias u
WHERE u.status IN ('conectado', 'connected', 'open')
  AND NOT EXISTS (
    SELECT 1 FROM public.funnel_events f
    WHERE f.user_id = u.user_id AND f.event_name = 'whatsapp_connected'
  )
GROUP BY u.user_id;