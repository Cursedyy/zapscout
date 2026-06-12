
-- Função só é usada por trigger; ninguém deve invocá-la diretamente.
REVOKE EXECUTE ON FUNCTION public.enforce_aquecimento_chips_max() FROM PUBLIC, anon, authenticated;
