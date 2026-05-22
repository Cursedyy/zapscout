-- 1) Restrict column-level access to credential fields on profiles.
REVOKE SELECT (
  wa_meta_token, wa_api_key, wa_instance_name, wa_meta_business_id,
  wa_meta_phone_id, wa_server_url, uazapi_instance_token, token_acesso,
  kiwify_order_id
) ON public.profiles FROM anon, authenticated;

REVOKE UPDATE (
  wa_meta_token, wa_api_key, wa_instance_name, wa_meta_business_id,
  wa_meta_phone_id, wa_server_url, uazapi_instance_token, token_acesso,
  kiwify_order_id
) ON public.profiles FROM anon, authenticated;

REVOKE INSERT (
  wa_meta_token, wa_api_key, wa_instance_name, wa_meta_business_id,
  wa_meta_phone_id, wa_server_url, uazapi_instance_token, token_acesso,
  kiwify_order_id
) ON public.profiles FROM anon, authenticated;

-- 2) Reinstall pg_net in the extensions schema instead of public.
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
