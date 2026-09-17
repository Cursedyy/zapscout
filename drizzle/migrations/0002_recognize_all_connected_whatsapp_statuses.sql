CREATE OR REPLACE FUNCTION public.capture_whatsapp_connected_funnel_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('conectado', 'connected', 'open')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NOT EXISTS (
       SELECT 1 FROM public.funnel_events
       WHERE user_id = NEW.user_id AND event_name = 'whatsapp_connected'
     ) THEN
    INSERT INTO public.funnel_events (user_id, event_name, source)
    VALUES (NEW.user_id, 'whatsapp_connected', 'database');
  END IF;
  RETURN NEW;
END;
$$;