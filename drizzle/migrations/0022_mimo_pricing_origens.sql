-- Source data is loaded privately after this schema migration; never embed costs in public Git.
CREATE TABLE public.mimo_pricing_origens (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), hash text NOT NULL,
 origem text NOT NULL, dados jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(empresa_id,hash)
);
ALTER TABLE public.mimo_pricing_origens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_pricing_origens FROM anon,authenticated;
GRANT SELECT ON public.mimo_pricing_origens TO authenticated;
CREATE POLICY pricing_origem_ler ON public.mimo_pricing_origens FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
