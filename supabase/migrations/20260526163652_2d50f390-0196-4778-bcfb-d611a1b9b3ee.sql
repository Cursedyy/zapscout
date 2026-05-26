REVOKE UPDATE (
  plano,
  email,
  token_acesso,
  kiwify_order_id,
  senha_definida,
  wa_api_key,
  wa_meta_token,
  wa_meta_business_id,
  wa_meta_phone_id,
  wa_instance_name,
  wa_server_url,
  wa_method,
  wa_provider,
  uazapi_instance_token,
  uazapi_instance_status,
  uazapi_numero,
  uazapi_ultimo_ping
) ON public.profiles FROM authenticated, anon;