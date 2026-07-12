CREATE OR REPLACE FUNCTION public.prevent_envios_manuais_premature_requeue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'enviando'
     AND NEW.status = 'pendente'
     AND OLD.updated_at > now() - interval '15 minutes'
     AND NEW.agendado_para IS NOT DISTINCT FROM OLD.agendado_para
     AND NEW.tentativas IS NOT DISTINCT FROM OLD.tentativas
     AND NEW.ultimo_erro IS NOT DISTINCT FROM OLD.ultimo_erro
     AND NEW.enviado_em IS NOT DISTINCT FROM OLD.enviado_em
  THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS envios_manuais_prevent_premature_requeue ON public.envios_manuais_fila;

CREATE TRIGGER envios_manuais_prevent_premature_requeue
  BEFORE UPDATE ON public.envios_manuais_fila
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_envios_manuais_premature_requeue();