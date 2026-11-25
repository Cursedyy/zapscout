CREATE TABLE public.mimo_vendas_mensais (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  competencia date NOT NULL CHECK (extract(day FROM competencia) = 1),
  demonstrativo jsonb NOT NULL CHECK (
    jsonb_typeof(demonstrativo) = 'object'
    AND demonstrativo ?& ARRAY['semanas', 'total']
    AND jsonb_typeof(demonstrativo->'semanas') = 'array'
    AND jsonb_typeof(demonstrativo->'total') = 'object'
  ),
  PRIMARY KEY (empresa_id, competencia)
);
--> statement-breakpoint
ALTER TABLE public.mimo_vendas_mensais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.mimo_vendas_mensais FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public.mimo_vendas_mensais TO authenticated;
--> statement-breakpoint
CREATE POLICY mimo_vendas_mensais_gestao ON public.mimo_vendas_mensais
FOR SELECT TO authenticated USING (
  public.tem_papel_empresa(empresa_id, (SELECT auth.uid()), ARRAY['administrador','gestor']::public.empresa_papel[])
  AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND e.slug = 'mimo' AND e.ativa)
);
