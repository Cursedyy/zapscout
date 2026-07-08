
CREATE TABLE public.envios_manuais_fila (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID NULL,
  campanha_id UUID NULL,
  numero TEXT NOT NULL,
  texto TEXT NOT NULL,
  step INTEGER NULL,
  agendado_para TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pendente',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT NULL,
  uazapi_message_id TEXT NULL,
  enviado_em TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT envios_manuais_fila_status_chk
    CHECK (status IN ('pendente','enviado','falha','cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.envios_manuais_fila TO authenticated;
GRANT ALL ON public.envios_manuais_fila TO service_role;

ALTER TABLE public.envios_manuais_fila ENABLE ROW LEVEL SECURITY;

CREATE POLICY "envios_manuais_fila_select_own"
  ON public.envios_manuais_fila FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "envios_manuais_fila_insert_own"
  ON public.envios_manuais_fila FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "envios_manuais_fila_update_own"
  ON public.envios_manuais_fila FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "envios_manuais_fila_delete_own"
  ON public.envios_manuais_fila FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX envios_manuais_fila_pendentes_idx
  ON public.envios_manuais_fila (agendado_para)
  WHERE status = 'pendente';

CREATE INDEX envios_manuais_fila_user_idx
  ON public.envios_manuais_fila (user_id, created_at DESC);

CREATE TRIGGER envios_manuais_fila_touch_updated_at
  BEFORE UPDATE ON public.envios_manuais_fila
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
