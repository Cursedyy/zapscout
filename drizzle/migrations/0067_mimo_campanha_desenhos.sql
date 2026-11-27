CREATE TABLE public.mimo_campanha_desenhos (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  instagram text NOT NULL CHECK (instagram ~ '^[a-z0-9_.]{1,30}$' AND instagram !~ '(^\.|\.\.|\.$)'),
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime')),
  tamanho integer NOT NULL CHECK (tamanho BETWEEN 1 AND 26214400),
  hash_arquivo text NOT NULL CHECK (hash_arquivo ~ '^[0-9a-f]{64}$'),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  recebido_em timestamptz
);
--> statement-breakpoint
CREATE INDEX mimo_desenhos_lista_idx ON public.mimo_campanha_desenhos
  (empresa_id, recebido_em DESC, id DESC) WHERE recebido_em IS NOT NULL;
--> statement-breakpoint
CREATE INDEX mimo_desenhos_limite_idx ON public.mimo_campanha_desenhos
  (empresa_id, ip_hash, created_at);
--> statement-breakpoint
ALTER TABLE public.mimo_campanha_desenhos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.mimo_campanha_desenhos FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT (id, empresa_id, instagram, mime, tamanho, hash_arquivo, recebido_em)
  ON public.mimo_campanha_desenhos TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.mimo_campanha_desenhos TO service_role;
--> statement-breakpoint
CREATE POLICY mimo_desenhos_equipe ON public.mimo_campanha_desenhos FOR SELECT TO authenticated
  USING (recebido_em IS NOT NULL AND public.tem_papel_empresa(
    empresa_id, (SELECT auth.uid()),
    ARRAY['administrador', 'gestor', 'marketing', 'lider_marketing']::public.empresa_papel[]
  ));
--> statement-breakpoint
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mimo-campanha-desenhos', 'mimo-campanha-desenhos', false, 26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
--> statement-breakpoint
CREATE FUNCTION public.mimo_reservar_desenho(
  p_id uuid, p_instagram text, p_mime text, p_tamanho integer, p_hash text, p_ip_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  empresa uuid;
  envio public.mimo_campanha_desenhos%ROWTYPE;
BEGIN
  SELECT id INTO empresa FROM public.empresas WHERE slug = 'mimo' AND ativa;
  IF empresa IS NULL THEN RETURN jsonb_build_object('estado', 'indisponivel'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('mimo_desenho:' || p_ip_hash, 0));
  SELECT * INTO envio FROM public.mimo_campanha_desenhos WHERE id = p_id;
  IF NOT FOUND THEN
    IF (SELECT count(*) FROM public.mimo_campanha_desenhos
      WHERE empresa_id = empresa AND ip_hash = p_ip_hash AND created_at > now() - interval '1 hour') >= 8
    THEN RETURN jsonb_build_object('estado', 'limite'); END IF;
    INSERT INTO public.mimo_campanha_desenhos
      (id, empresa_id, instagram, mime, tamanho, hash_arquivo, ip_hash)
      VALUES (p_id, empresa, p_instagram, p_mime, p_tamanho, p_hash, p_ip_hash)
      ON CONFLICT (id) DO NOTHING;
    SELECT * INTO STRICT envio FROM public.mimo_campanha_desenhos WHERE id = p_id;
  END IF;
  IF (envio.empresa_id, envio.instagram, envio.mime, envio.tamanho, envio.hash_arquivo)
    IS DISTINCT FROM (empresa, p_instagram, p_mime, p_tamanho, p_hash)
  THEN RETURN jsonb_build_object('estado', 'conflito'); END IF;
  RETURN jsonb_build_object(
    'estado', CASE WHEN envio.recebido_em IS NULL THEN 'reservado' ELSE 'recebido' END,
    'empresa', empresa
  );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mimo_reservar_desenho(uuid, text, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mimo_reservar_desenho(uuid, text, text, integer, text, text)
  TO service_role;
