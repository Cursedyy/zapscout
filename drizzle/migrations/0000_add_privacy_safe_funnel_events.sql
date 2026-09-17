CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name IN ('email_confirmed','plans_viewed','checkout_clicked','first_search','first_lead','whatsapp_connected','first_message_sent','purchase_approved')),
  plan_id text CHECK (plan_id IS NULL OR plan_id IN ('free','pro','agencia','business')),
  source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','database','payment')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own funnel events"
ON public.funnel_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own funnel events"
ON public.funnel_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_dono(auth.uid()));

CREATE INDEX funnel_events_created_at_idx ON public.funnel_events (created_at DESC);
CREATE INDEX funnel_events_user_event_idx ON public.funnel_events (user_id, event_name);

CREATE OR REPLACE FUNCTION public.track_funnel_event(
  _event_name text,
  _plan_id text DEFAULT NULL,
  _source text DEFAULT 'app'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  INSERT INTO public.funnel_events (user_id, event_name, plan_id, source)
  VALUES (auth.uid(), _event_name, _plan_id, _source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_funnel_event(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_first_lead_funnel_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.funnel_events
    WHERE user_id = NEW.user_id AND event_name = 'first_lead'
  ) THEN
    INSERT INTO public.funnel_events (user_id, event_name, source)
    VALUES (NEW.user_id, 'first_lead', 'database');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_capture_first_funnel_event
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.capture_first_lead_funnel_event();

CREATE OR REPLACE FUNCTION public.capture_first_message_funnel_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'enviado' AND NOT EXISTS (
    SELECT 1 FROM public.funnel_events
    WHERE user_id = NEW.user_id AND event_name = 'first_message_sent'
  ) THEN
    INSERT INTO public.funnel_events (user_id, event_name, source)
    VALUES (NEW.user_id, 'first_message_sent', 'database');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mensagens_capture_first_funnel_event
AFTER INSERT OR UPDATE OF status ON public.mensagens_enviadas
FOR EACH ROW EXECUTE FUNCTION public.capture_first_message_funnel_event();

CREATE OR REPLACE FUNCTION public.capture_whatsapp_connected_funnel_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'conectado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS (
    SELECT 1 FROM public.funnel_events
    WHERE user_id = NEW.user_id AND event_name = 'whatsapp_connected'
  ) THEN
    INSERT INTO public.funnel_events (user_id, event_name, source)
    VALUES (NEW.user_id, 'whatsapp_connected', 'database');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER uazapi_capture_connected_funnel_event
AFTER INSERT OR UPDATE OF status ON public.uazapi_instancias
FOR EACH ROW EXECUTE FUNCTION public.capture_whatsapp_connected_funnel_event();