
-- Anchor dono privilege to a fixed identifier (hardcoded UUID + JWT email),
-- not the mutable profiles.plano column. Prevents privilege escalation into
-- reading other users' wa_api_key / wa_meta_token / uazapi_instance_token.

CREATE OR REPLACE FUNCTION public.is_dono(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    _user_id = '3f8d4e9b-990e-4723-b37a-10caf5902204'::uuid
    AND COALESCE(
      (auth.jwt() ->> 'email'),
      ''
    ) = 'matheuscrodrigues99@gmail.com'
    AND _user_id = auth.uid();
$function$;

-- Mirror in the `private` schema (used by policies above)
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_dono(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    _user_id = '3f8d4e9b-990e-4723-b37a-10caf5902204'::uuid
    AND COALESCE(
      (auth.jwt() ->> 'email'),
      ''
    ) = 'matheuscrodrigues99@gmail.com'
    AND _user_id = auth.uid();
$function$;
