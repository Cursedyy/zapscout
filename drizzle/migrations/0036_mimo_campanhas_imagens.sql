ALTER TABLE public.mimo_campanhas_comerciais ADD COLUMN imagens jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION public.mimo_validar_imagens_campanha() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE imagem jsonb;
BEGIN
 IF jsonb_typeof(NEW.imagens) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de imagens inválida'; END IF;
 IF jsonb_array_length(NEW.imagens)>6 THEN RAISE EXCEPTION 'Máximo de seis imagens'; END IF;
 FOR imagem IN SELECT value FROM jsonb_array_elements(NEW.imagens) LOOP
  IF jsonb_typeof(imagem) IS DISTINCT FROM 'object'
    OR jsonb_typeof(imagem->'nome') IS DISTINCT FROM 'string'
    OR length(trim(imagem->>'nome')) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(imagem->'path') IS DISTINCT FROM 'string'
    OR (imagem->>'path') !~ ('^' || NEW.empresa_id::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')
  THEN RAISE EXCEPTION 'Imagem inválida ou de outra empresa'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_validar_imagens_campanha() FROM PUBLIC;
CREATE TRIGGER mimo_campanha_validar_imagens BEFORE INSERT OR UPDATE ON public.mimo_campanhas_comerciais
FOR EACH ROW EXECUTE FUNCTION public.mimo_validar_imagens_campanha();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('mimo-campanhas','mimo-campanhas',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);

CREATE POLICY mimo_campanhas_imagens_enviar ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='mimo-campanhas' AND split_part(name,'/',2)=auth.uid()::text
 AND EXISTS(SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(name,'/',1) AND e.slug='mimo' AND e.ativa
 AND public.tem_papel_empresa(e.id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[]))
);
CREATE POLICY mimo_campanhas_imagens_ler ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='mimo-campanhas' AND EXISTS(
 SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(name,'/',1) AND e.slug='mimo' AND e.ativa
 AND public.is_membro_empresa(e.id,auth.uid()) AND (
 public.tem_papel_empresa(e.id,auth.uid(),ARRAY['administrador','gestor','marketing']::public.empresa_papel[])
 OR EXISTS(SELECT 1 FROM public.mimo_campanhas_comerciais c WHERE c.empresa_id=e.id AND c.status='publicada'
 AND c.imagens @> jsonb_build_array(jsonb_build_object('path',storage.objects.name)))
 ))
);
