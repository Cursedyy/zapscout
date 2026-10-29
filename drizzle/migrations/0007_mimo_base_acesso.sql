CREATE TYPE public.empresa_papel AS ENUM ('administrador', 'gestor', 'vendedor');

CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 120),
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.empresa_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  papel public.empresa_papel NOT NULL DEFAULT 'vendedor',
  ativo boolean NOT NULL DEFAULT true,
  adicionado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, user_id)
);
CREATE INDEX empresa_membros_user_idx ON public.empresa_membros(user_id);

GRANT SELECT, UPDATE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_membros TO authenticated;
GRANT ALL ON public.empresa_membros TO service_role;

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_membros ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.empresa_papel_de(_empresa_id uuid, _user_id uuid)
RETURNS public.empresa_papel LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.papel FROM public.empresa_membros m
  JOIN public.empresas e ON e.id = m.empresa_id AND e.ativa
  WHERE m.empresa_id = _empresa_id AND m.user_id = _user_id AND m.ativo
$$;

CREATE OR REPLACE FUNCTION public.is_membro_empresa(_empresa_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.empresa_papel_de(_empresa_id, _user_id) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.tem_papel_empresa(_empresa_id uuid, _user_id uuid, _papeis public.empresa_papel[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.empresa_papel_de(_empresa_id, _user_id) = ANY(_papeis), false)
$$;

REVOKE EXECUTE ON FUNCTION public.empresa_papel_de(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_membro_empresa(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tem_papel_empresa(uuid, uuid, public.empresa_papel[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empresa_papel_de(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_membro_empresa(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tem_papel_empresa(uuid, uuid, public.empresa_papel[]) TO authenticated, service_role;

-- empresas: membros leem; só administrador edita; criar/excluir só pelo servidor
CREATE POLICY "membros leem a empresa" ON public.empresas FOR SELECT TO authenticated
  USING (public.is_membro_empresa(id, auth.uid()));
CREATE POLICY "administrador edita a empresa" ON public.empresas FOR UPDATE TO authenticated
  USING (public.tem_papel_empresa(id, auth.uid(), ARRAY['administrador']::public.empresa_papel[]))
  WITH CHECK (public.tem_papel_empresa(id, auth.uid(), ARRAY['administrador']::public.empresa_papel[]));

-- membros: colegas se veem; só administrador gerencia
CREATE POLICY "membros veem colegas" ON public.empresa_membros FOR SELECT TO authenticated
  USING (public.is_membro_empresa(empresa_id, auth.uid()));
CREATE POLICY "administrador adiciona membros" ON public.empresa_membros FOR INSERT TO authenticated
  WITH CHECK (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador']::public.empresa_papel[]));
CREATE POLICY "administrador altera membros" ON public.empresa_membros FOR UPDATE TO authenticated
  USING (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador']::public.empresa_papel[]))
  WITH CHECK (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador']::public.empresa_papel[]));
CREATE POLICY "administrador remove membros" ON public.empresa_membros FOR DELETE TO authenticated
  USING (public.tem_papel_empresa(empresa_id, auth.uid(), ARRAY['administrador']::public.empresa_papel[]));

-- protege contra mudança de empresa/usuário e contra ficar sem administrador
CREATE OR REPLACE FUNCTION public.empresa_membros_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.adicionado_por := COALESCE(auth.uid(), NEW.adicionado_por);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.empresa_id <> OLD.empresa_id OR NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'Não é permitido mover um vínculo entre empresas ou usuários';
  END IF;
  v_emp := OLD.empresa_id;
  IF OLD.papel = 'administrador' AND OLD.ativo AND (
       TG_OP = 'DELETE' OR NEW.papel <> 'administrador' OR NOT NEW.ativo)
     AND NOT EXISTS (SELECT 1 FROM public.empresa_membros
                     WHERE empresa_id = v_emp AND papel = 'administrador' AND ativo AND id <> OLD.id) THEN
    RAISE EXCEPTION 'A empresa precisa de pelo menos um administrador ativo';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER empresa_membros_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.empresa_membros
  FOR EACH ROW EXECUTE FUNCTION public.empresa_membros_guard();

CREATE OR REPLACE FUNCTION public.empresas_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.slug <> OLD.slug AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'O identificador da empresa não pode ser alterado';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER empresas_guard_trg BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.empresas_guard();