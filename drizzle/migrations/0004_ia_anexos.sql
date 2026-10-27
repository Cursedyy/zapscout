CREATE TABLE public.ia_anexos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 nome text NOT NULL, storage_path text NOT NULL UNIQUE, mime_type text NOT NULL,
 categoria text NOT NULL CHECK (categoria IN ('imagem','catalogo')),
 ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_anexos TO authenticated;
GRANT ALL ON public.ia_anexos TO service_role;
ALTER TABLE public.ia_anexos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_anexos_owner ON public.ia_anexos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ia_anexos_storage_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ia-vendas-anexos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ia_anexos_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ia-vendas-anexos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY ia_anexos_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ia-vendas-anexos' AND (storage.foldername(name))[1] = auth.uid()::text);