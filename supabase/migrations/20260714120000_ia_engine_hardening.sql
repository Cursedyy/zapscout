-- Motor de IA conversacional: telefone de alerta, instâncias UazAPI extras
-- (prospecção dedicada, sem mexer na instância principal em profiles),
-- vínculo de conversa com a instância que recebeu a mensagem, e dedupe
-- de eventos de webhook.

ALTER TABLE public.ia_config
  ADD COLUMN IF NOT EXISTS telefone_alerta text;

-- Instâncias UazAPI adicionais por usuário (a principal continua em
-- profiles.uazapi_instance_token — não migrada, para não arriscar os
-- fluxos existentes de campanha/envio manual).
CREATE TABLE public.uazapi_instancias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('prospeccao', 'secundaria')),
  nome text,
  token text,
  numero text,
  status text NOT NULL DEFAULT 'desconectado',
  conectado_em timestamptz,
  ultimo_ping timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tipo)
);

REVOKE ALL ON public.uazapi_instancias FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uazapi_instancias TO authenticated;
GRANT ALL ON public.uazapi_instancias TO service_role;

ALTER TABLE public.uazapi_instancias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own uazapi instancias"
ON public.uazapi_instancias
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Qual instância recebeu a mensagem que originou a conversa.
-- NULL = instância principal (profiles.uazapi_instance_token) — comportamento
-- atual, nenhuma conversa existente precisa de backfill.
ALTER TABLE public.ia_conversas
  ADD COLUMN IF NOT EXISTS uazapi_instancia_id uuid REFERENCES public.uazapi_instancias(id) ON DELETE SET NULL;

-- Dedupe de eventos recebidos do webhook UazAPI (event_id = "{token}:{messageId}").
-- Somente service_role acessa — não é dado de operação do usuário no client.
CREATE TABLE public.ia_webhook_eventos (
  event_id text PRIMARY KEY,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.ia_webhook_eventos FROM anon;
REVOKE ALL ON public.ia_webhook_eventos FROM authenticated;
GRANT ALL ON public.ia_webhook_eventos TO service_role;

ALTER TABLE public.ia_webhook_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients cannot access ia_webhook_eventos"
ON public.ia_webhook_eventos
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
