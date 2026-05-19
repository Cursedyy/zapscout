-- TEMPLATES
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  mensagem text NOT NULL,
  custom boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own templates all" ON public.templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER templates_touch BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- LEADS: campos de app
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sequence_state jsonb,
  ADD COLUMN IF NOT EXISTS nicho text,
  ADD COLUMN IF NOT EXISTS lead_external_id text;

CREATE INDEX IF NOT EXISTS leads_user_status_idx ON public.leads(user_id, status);
CREATE INDEX IF NOT EXISTS leads_seq_active_idx ON public.leads(user_id) WHERE sequence_state IS NOT NULL;

-- CAMPANHAS: campos extras
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS mensagem_override text,
  ADD COLUMN IF NOT EXISTS filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS campanhas_status_idx ON public.campanhas(status);

-- PROFILES: configs do app
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followup_dias int[] NOT NULL DEFAULT ARRAY[1,2,3],
  ADD COLUMN IF NOT EXISTS default_intervalo_segundos int NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS pular_preview_wa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uazapi_instance_token text,
  ADD COLUMN IF NOT EXISTS uazapi_instance_status text NOT NULL DEFAULT 'desconectado',
  ADD COLUMN IF NOT EXISTS uazapi_numero text,
  ADD COLUMN IF NOT EXISTS uazapi_ultimo_ping timestamptz;

-- MENSAGENS ENVIADAS: passo da cadência + status do envio
ALTER TABLE public.mensagens_enviadas
  ADD COLUMN IF NOT EXISTS step int,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'enviado',
  ADD COLUMN IF NOT EXISTS uazapi_message_id text;

CREATE INDEX IF NOT EXISTS msgs_lead_idx ON public.mensagens_enviadas(lead_id, enviado_em DESC);
CREATE INDEX IF NOT EXISTS msgs_campanha_idx ON public.mensagens_enviadas(campanha_id, enviado_em DESC);