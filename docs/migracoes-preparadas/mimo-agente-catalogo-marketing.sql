-- Prepared only. Verify backup and apply through the official migrator before publishing.
-- The attendance agent sends the current MiMo catalog PDF itself. Marketing (and lider_marketing),
-- besides administrador/gestor, swap that single PDF on its own page through a service-only RPC;
-- they gain no other access to the agent. The newest active catalog is sent without republishing the
-- agent version (presentations still require approval in the version), and replaced catalogs are
-- deactivated, never deleted. The private bucket accepts PDFs up to 50 MB for full catalogs.
UPDATE storage.buckets SET file_size_limit=52428800 WHERE id='mimo-agente-materiais' AND coalesce(file_size_limit,0)<52428800;

DO $patch$
DECLARE
  worker text := pg_get_functiondef('public.mimo_agente_worker(text,jsonb)'::regprocedure);
  operar text := pg_get_functiondef('public.mimo_agente_operar(uuid,uuid,text,jsonb)'::regprocedure);
  a_reserva constant text := $m$AND m.ativo AND v->'materiais' ? m.id::text)$m$;
  a_autorizar constant text := $m$AND ativo AND v->'materiais' ? id::text FOR SHARE;$m$;
  a_publicar constant text := $m$mm.ativo AND mm.id::text=x.id$m$;
BEGIN
  IF position($m$m.tipo='catalogo'$m$ IN worker) = 0 THEN
    IF (length(worker)-length(replace(worker,a_reserva,''))) <> length(a_reserva)
       OR (length(worker)-length(replace(worker,a_autorizar,''))) <> length(a_autorizar) THEN
      RAISE EXCEPTION 'Definição de mimo_agente_worker incompatível com o catálogo do marketing';
    END IF;
    worker := replace(worker,a_reserva,$n$AND m.ativo AND (v->'materiais' ? m.id::text OR m.tipo='catalogo'))$n$);
    worker := replace(worker,a_autorizar,$n$AND ativo AND (v->'materiais' ? id::text OR tipo='catalogo') FOR SHARE;$n$);
    EXECUTE worker;
  END IF;
  -- A replaced catalog may still be listed in the draft; it no longer blocks publishing.
  IF position($m$mm.tipo='catalogo'$m$ IN operar) = 0 THEN
    IF (length(operar)-length(replace(operar,a_publicar,''))) <> length(a_publicar) THEN
      RAISE EXCEPTION 'Definição de mimo_agente_operar incompatível com o catálogo do marketing';
    END IF;
    EXECUTE replace(operar,a_publicar,$n$(mm.ativo OR mm.tipo='catalogo') AND mm.id::text=x.id$n$);
  END IF;
END $patch$;

CREATE OR REPLACE FUNCTION public.mimo_agente_catalogo_trocar(_empresa uuid,_ator uuid,_id uuid,_nome text,_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo
  AND papel::text IN ('administrador','gestor','marketing','lider_marketing') FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) THEN
  RAISE EXCEPTION 'Sem permissão para trocar o catálogo';
 END IF;
 IF length(btrim(coalesce(_nome,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Nome do catálogo inválido'; END IF;
 IF _path IS DISTINCT FROM _empresa::text||'/'||_id::text||'.pdf'
    OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='mimo-agente-materiais' AND name=_path) THEN
  RAISE EXCEPTION 'Arquivo privado inválido';
 END IF;
 -- Serialize concurrent swaps so exactly one catalog stays active.
 PERFORM pg_advisory_xact_lock(hashtextextended('mimo_agente_catalogo:'||_empresa::text,0));
 UPDATE public.mimo_agente_materiais SET ativo=false WHERE empresa_id=_empresa AND tipo='catalogo' AND ativo;
 INSERT INTO public.mimo_agente_materiais(id,empresa_id,nome,tipo,path,mime,ator_id)
  VALUES(_id,_empresa,btrim(_nome),'catalogo',_path,'application/pdf',_ator);
 INSERT INTO public.mimo_agente_historico(empresa_id,ator_id,acao,dados)
  VALUES(_empresa,_ator,'catalogo',jsonb_build_object('id',_id,'nome',btrim(_nome)));
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_catalogo_trocar(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_catalogo_trocar(uuid,uuid,uuid,text,text) TO service_role;
