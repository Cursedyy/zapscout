
-- 1) Corrige search_path mutável em set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) Revoga execução de funções SECURITY DEFINER de roles públicos
REVOKE EXECUTE ON FUNCTION public.is_dono(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3) Bloqueia escrita em colunas sensíveis do profiles por usuários comuns
-- Primeiro garante que authenticated/anon NÃO tenham UPDATE genérico, e
-- depois concede UPDATE apenas em colunas seguras.
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;

GRANT UPDATE (
  nome,
  foto_url,
  followup_dias,
  default_intervalo_segundos,
  pular_preview_wa,
  uazapi_instance_status,
  uazapi_numero,
  uazapi_ultimo_ping,
  wa_provider,
  wa_method,
  wa_server_url,
  wa_instance_name,
  wa_meta_phone_id,
  wa_meta_business_id,
  wa_display_name
) ON TABLE public.profiles TO authenticated;

-- Colunas sensíveis (plano, credenciais, tokens) ficam acessíveis apenas via
-- service_role (usado pelos server functions admin). Nem authenticated nem anon
-- podem escrever em: plano, email, uazapi_instance_token, wa_api_key,
-- wa_meta_token, token_acesso, kiwify_order_id, senha_definida, id,
-- created_at, updated_at.
