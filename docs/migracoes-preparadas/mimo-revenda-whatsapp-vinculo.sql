CREATE OR REPLACE FUNCTION public.mimo_receber_whatsapp_comercial(_vinculo uuid, _owner uuid, _token_sha256 text, _message_id text, _telefone text, _nome text, _texto text, _contato_em timestamp with time zone, _from_me boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.mimo_whatsapp_vinculos; n text; l uuid; evento uuid;
BEGIN
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND ativo AND owner_id=_owner AND token_sha256=_token_sha256 FOR UPDATE;
 IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=v.empresa_id AND slug='mimo' AND ativa)
 OR NOT public.tem_papel_empresa(v.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 IF coalesce(length(_message_id),0) NOT BETWEEN 1 AND 200 OR _texto IS NULL OR length(_texto)>10000 OR _contato_em IS NULL OR NOT isfinite(_contato_em) OR _contato_em>now()+interval '5 minutes' OR _from_me IS NULL THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 n:=public.mimo_normalizar_telefone(_telefone);
 IF n IS NULL OR public.mimo_comercial_telefone_interno(v.empresa_id,n) THEN RETURN NULL; END IF;
 -- Serializes the same canonical contact across all commercial numbers.
 PERFORM pg_advisory_xact_lock(hashtextextended(v.empresa_id::text||n,0));
 INSERT INTO public.mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,direcao,texto,contato_em)
 VALUES(v.empresa_id,v.id,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_texto,_contato_em)
 ON CONFLICT(vinculo_id,message_id) DO NOTHING RETURNING id INTO evento;
 IF evento IS NULL THEN SELECT lead_id INTO l FROM public.mimo_whatsapp_eventos WHERE vinculo_id=v.id AND message_id=_message_id; RETURN l; END IF;
 SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND telefone_normalizado=n FOR UPDATE;
 IF l IS NULL THEN
  SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND id=public.mimo_revenda_lead_por_telefone(v.empresa_id,n) FOR UPDATE;
 END IF;
 -- Unclassified existing bindings keep their previously authorized entry semantics until reviewed.
 -- Every new binding has explicit purpose; closing NEVER creates a lead, even with ad evidence.
 IF NOT _from_me AND l IS NULL AND (v.finalidade='entrada' OR v.finalidade IS NULL) THEN
  INSERT INTO public.mimo_leads(empresa_id,nome_empresa,nome_contato,telefone,origem,entrada_em,created_by,primeiro_contato_whatsapp_em,ultimo_contato_whatsapp_em)
  VALUES(v.empresa_id,coalesce(nullif(left(btrim(_nome),200),''),n),coalesce(left(_nome,200),''),n,'whatsapp',_contato_em,v.confirmado_por,_contato_em,_contato_em)
  ON CONFLICT(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL DO UPDATE SET
  primeiro_contato_whatsapp_em=least(public.mimo_leads.primeiro_contato_whatsapp_em,EXCLUDED.primeiro_contato_whatsapp_em),ultimo_contato_whatsapp_em=greatest(public.mimo_leads.ultimo_contato_whatsapp_em,EXCLUDED.ultimo_contato_whatsapp_em) RETURNING id INTO l;
 ELSIF l IS NOT NULL THEN
  UPDATE public.mimo_leads SET primeiro_contato_whatsapp_em=least(primeiro_contato_whatsapp_em,_contato_em),ultimo_contato_whatsapp_em=greatest(ultimo_contato_whatsapp_em,_contato_em) WHERE id=l;
 END IF;
 UPDATE public.mimo_whatsapp_eventos SET lead_id=l WHERE id=evento;
 RETURN l;
END $function$;

