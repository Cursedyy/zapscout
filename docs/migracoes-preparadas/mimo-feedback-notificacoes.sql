-- Apply through the official migrator after verifying the shared database backup.
CREATE OR REPLACE FUNCTION public.mimo_feedback_notificar_gestao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  INSERT INTO public.notificacoes(user_id,tipo,titulo,descricao,link)
  SELECT DISTINCT m.user_id,'feedback','Novo feedback MiMo',
    'Uma nova sugestão está disponível no painel de feedbacks.', '/mimo/feedbacks'
  FROM public.empresa_membros m
  JOIN public.empresas e ON e.id=m.empresa_id AND e.slug='mimo' AND e.ativa
  JOIN auth.users u ON u.id=m.user_id
  WHERE m.empresa_id=NEW.empresa_id AND m.ativo
    AND m.papel IN ('administrador','gestor') AND m.user_id<>NEW.criado_por;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mimo_feedback_notificar_gestao() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS mimo_feedback_notificar_gestao ON public.mimo_feedbacks;
CREATE TRIGGER mimo_feedback_notificar_gestao
  AFTER INSERT ON public.mimo_feedbacks FOR EACH ROW
  EXECUTE FUNCTION public.mimo_feedback_notificar_gestao();
