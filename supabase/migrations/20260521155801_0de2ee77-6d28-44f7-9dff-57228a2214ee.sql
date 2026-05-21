ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wa_provider text,
  ADD COLUMN IF NOT EXISTS wa_method text,
  ADD COLUMN IF NOT EXISTS wa_server_url text,
  ADD COLUMN IF NOT EXISTS wa_api_key text,
  ADD COLUMN IF NOT EXISTS wa_instance_name text,
  ADD COLUMN IF NOT EXISTS wa_meta_phone_id text,
  ADD COLUMN IF NOT EXISTS wa_meta_token text,
  ADD COLUMN IF NOT EXISTS wa_meta_business_id text,
  ADD COLUMN IF NOT EXISTS wa_display_name text;