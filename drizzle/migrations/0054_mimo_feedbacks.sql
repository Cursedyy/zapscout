CREATE TABLE public.mimo_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 100 AND titulo ~ '[^[:space:]]'),
  mensagem text NOT NULL CHECK (length(mensagem) BETWEEN 1 AND 2000 AND mensagem ~ '[^[:space:]]'),
  estado text NOT NULL DEFAULT 'recebido' CHECK (estado IN ('recebido', 'em_analise', 'concluido', 'arquivado')),
  versao integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

CREATE INDEX mimo_feedbacks_empresa_ordem_idx
  ON public.mimo_feedbacks (empresa_id, created_at DESC, id DESC);

ALTER TABLE public.mimo_feedbacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_feedbacks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.mimo_feedbacks TO authenticated;
GRANT INSERT (id, empresa_id, titulo, mensagem) ON public.mimo_feedbacks TO authenticated;
GRANT UPDATE (estado) ON public.mimo_feedbacks TO authenticated;

CREATE POLICY mimo_feedbacks_leitura ON public.mimo_feedbacks FOR SELECT TO authenticated
  USING (empresa_id IN (
    SELECT id FROM public.empresas
    WHERE slug = 'mimo' AND ativa AND public.is_membro_empresa(id, (SELECT auth.uid()))
  ));

CREATE POLICY mimo_feedbacks_envio ON public.mimo_feedbacks FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = (SELECT auth.uid())
    AND empresa_id IN (
      SELECT id FROM public.empresas
      WHERE slug = 'mimo' AND ativa AND public.is_membro_empresa(id, (SELECT auth.uid()))
    )
  );

CREATE POLICY mimo_feedbacks_administracao ON public.mimo_feedbacks FOR UPDATE TO authenticated
  USING (empresa_id IN (
    SELECT id FROM public.empresas
    WHERE slug = 'mimo' AND ativa
      AND public.tem_papel_empresa(id, (SELECT auth.uid()), ARRAY['administrador']::public.empresa_papel[])
  ))
  WITH CHECK (empresa_id IN (
    SELECT id FROM public.empresas
    WHERE slug = 'mimo' AND ativa
      AND public.tem_papel_empresa(id, (SELECT auth.uid()), ARRAY['administrador']::public.empresa_papel[])
  ));

CREATE FUNCTION public.mimo_feedback_atualizar_metadados()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.versao := OLD.versao + 1;
  NEW.atualizado_em := clock_timestamp();
  NEW.atualizado_por := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mimo_feedback_atualizar_metadados() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER mimo_feedback_atualizar_metadados
  BEFORE UPDATE OF estado ON public.mimo_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.mimo_feedback_atualizar_metadados();
