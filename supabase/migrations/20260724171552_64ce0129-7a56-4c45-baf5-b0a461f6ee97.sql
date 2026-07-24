REVOKE EXECUTE ON FUNCTION public.check_login_lockout(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_login_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_login_lockout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_lockout(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_login_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_lockout(text) TO service_role;
