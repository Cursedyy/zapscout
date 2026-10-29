CREATE TABLE public.mimo_auditoria_admin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  autor_id uuid,
  acao text NOT NULL,
  alvo_user_id uuid,
  alvo_lead_id uuid,
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mimo_auditoria_admin_emp_idx ON public.mimo_auditoria_admin(empresa_id, created_at DESC);
GRANT SELECT ON public.mimo_auditoria_admin TO authenticated;
GRANT ALL ON public.mimo_auditoria_admin TO service_role;
ALTER TABLE public.mimo_auditoria_admin ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_auditoria_read ON public.mimo_auditoria_admin FOR SELECT TO authenticated
USING (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel]));

-- Nobody may change their own role or status directly; every membership write is audited.
CREATE OR REPLACE FUNCTION public.empresa_membros_auditar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.mimo_auditoria_admin(empresa_id, autor_id, acao, alvo_user_id, contexto)
    VALUES (NEW.empresa_id, auth.uid(), 'convite', NEW.user_id, jsonb_build_object('papel', NEW.papel, 'ativo', NEW.ativo));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.papel IS DISTINCT FROM OLD.papel THEN
      INSERT INTO public.mimo_auditoria_admin(empresa_id, autor_id, acao, alvo_user_id, contexto)
      VALUES (NEW.empresa_id, auth.uid(), 'alteracao_funcao', NEW.user_id, jsonb_build_object('de', OLD.papel, 'para', NEW.papel));
    END IF;
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      INSERT INTO public.mimo_auditoria_admin(empresa_id, autor_id, acao, alvo_user_id, contexto)
      VALUES (NEW.empresa_id, auth.uid(), CASE WHEN NEW.ativo THEN 'reativacao' ELSE 'desativacao' END, NEW.user_id, jsonb_build_object('papel', NEW.papel));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.mimo_auditoria_admin(empresa_id, autor_id, acao, alvo_user_id, contexto)
    VALUES (OLD.empresa_id, auth.uid(), 'remocao', OLD.user_id, jsonb_build_object('papel', OLD.papel));
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER empresa_membros_auditar AFTER INSERT OR UPDATE OR DELETE ON public.empresa_membros
FOR EACH ROW EXECUTE FUNCTION public.empresa_membros_auditar();

CREATE OR REPLACE FUNCTION public.empresa_membros_sem_autoalteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND OLD.user_id = auth.uid()
     AND (NEW.papel IS DISTINCT FROM OLD.papel OR NEW.ativo IS DISTINCT FROM OLD.ativo) THEN
    RAISE EXCEPTION 'Não é permitido alterar a própria função ou status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER empresa_membros_sem_autoalteracao BEFORE UPDATE ON public.empresa_membros
FOR EACH ROW EXECUTE FUNCTION public.empresa_membros_sem_autoalteracao();

CREATE OR REPLACE FUNCTION public.mimo_listar_membros(_empresa uuid)
RETURNS TABLE(user_id uuid, papel empresa_papel, ativo boolean, email text, nome text, created_at timestamptz, leads_atribuidos bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.tem_papel_empresa(_empresa, auth.uid(), ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel]) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id, m.papel, m.ativo, u.email::text, p.nome, m.created_at,
         (SELECT count(*) FROM public.mimo_leads l WHERE l.empresa_id = _empresa AND l.responsavel_id = m.user_id)
  FROM public.empresa_membros m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.empresa_id = _empresa
  ORDER BY m.ativo DESC, m.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.mimo_convidar_membro(_empresa uuid, _email text, _papel empresa_papel)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_ativo boolean;
BEGIN
  IF NOT public.tem_papel_empresa(_empresa, auth.uid(), ARRAY['administrador'::empresa_papel]) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(btrim(_email)) LIMIT 1;
  IF v_user IS NULL THEN RETURN 'conta_inexistente'; END IF;
  SELECT ativo INTO v_ativo FROM public.empresa_membros WHERE empresa_id = _empresa AND user_id = v_user;
  IF v_ativo IS TRUE THEN RETURN 'ja_membro'; END IF;
  IF v_ativo IS FALSE THEN
    IF v_user = auth.uid() THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501'; END IF;
    UPDATE public.empresa_membros SET ativo = true, papel = _papel WHERE empresa_id = _empresa AND user_id = v_user;
    RETURN 'reativado';
  END IF;
  INSERT INTO public.empresa_membros(empresa_id, user_id, papel, ativo, adicionado_por) VALUES (_empresa, v_user, _papel, true, auth.uid());
  RETURN 'adicionado';
END $$;

CREATE OR REPLACE FUNCTION public.mimo_alterar_papel(_empresa uuid, _user uuid, _papel empresa_papel)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.tem_papel_empresa(_empresa, auth.uid(), ARRAY['administrador'::empresa_papel]) OR _user = auth.uid() THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE public.empresa_membros SET papel = _papel WHERE empresa_id = _empresa AND user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mimo_definir_ativo(_empresa uuid, _user uuid, _ativo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_papel empresa_papel;
BEGIN
  IF _user = auth.uid() THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501'; END IF;
  SELECT papel INTO v_papel FROM public.empresa_membros WHERE empresa_id = _empresa AND user_id = _user;
  IF v_papel IS NULL THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
  IF NOT (public.tem_papel_empresa(_empresa, auth.uid(), ARRAY['administrador'::empresa_papel])
          OR (v_papel = 'vendedor' AND public.tem_papel_empresa(_empresa, auth.uid(), ARRAY['gestor'::empresa_papel]))) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE public.empresa_membros SET ativo = _ativo WHERE empresa_id = _empresa AND user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.mimo_reatribuir_leads(_empresa uuid, _para uuid, _de uuid DEFAULT NULL, _lead_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  IF NOT public.tem_papel_empresa(_empresa, auth.uid(), ARRAY['administrador'::empresa_papel,'gestor'::empresa_papel]) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_membro_empresa(_empresa, _para) THEN RAISE EXCEPTION 'Responsável inválido'; END IF;
  IF _de IS NULL AND (_lead_ids IS NULL OR cardinality(_lead_ids) = 0) THEN RAISE EXCEPTION 'Nada para transferir'; END IF;
  FOR r IN SELECT id, responsavel_id FROM public.mimo_leads
           WHERE empresa_id = _empresa
             AND (_de IS NULL OR responsavel_id = _de)
             AND (_lead_ids IS NULL OR id = ANY(_lead_ids))
             AND responsavel_id IS DISTINCT FROM _para
           FOR UPDATE LOOP
    UPDATE public.mimo_leads SET responsavel_id = _para WHERE id = r.id;
    INSERT INTO public.mimo_auditoria_admin(empresa_id, autor_id, acao, alvo_user_id, alvo_lead_id, contexto)
    VALUES (_empresa, auth.uid(), 'reatribuicao', _para, r.id, jsonb_build_object('responsavel_anterior', r.responsavel_id, 'novo_responsavel', _para));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.mimo_listar_membros(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mimo_convidar_membro(uuid, text, empresa_papel) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mimo_alterar_papel(uuid, uuid, empresa_papel) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mimo_definir_ativo(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mimo_reatribuir_leads(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mimo_listar_membros(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_convidar_membro(uuid, text, empresa_papel) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_alterar_papel(uuid, uuid, empresa_papel) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_definir_ativo(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_reatribuir_leads(uuid, uuid, uuid, uuid[]) TO authenticated;