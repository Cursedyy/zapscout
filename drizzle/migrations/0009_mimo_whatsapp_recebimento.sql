CREATE TABLE public.mimo_whatsapp_vinculos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id), owner_id uuid NOT NULL, instancia_id uuid, numero_comercial text NOT NULL, token_sha256 text NOT NULL UNIQUE CHECK(length(token_sha256)=64), ativo boolean NOT NULL DEFAULT false, confirmado_por uuid NOT NULL, confirmado_em timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mimo_whatsapp_vinculos TO authenticated;
GRANT ALL ON public.mimo_whatsapp_vinculos TO service_role;
ALTER TABLE public.mimo_whatsapp_vinculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_vinculos_read ON public.mimo_whatsapp_vinculos FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador']::public.empresa_papel[]));
CREATE TABLE public.mimo_whatsapp_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id), vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id), message_id text NOT NULL, lead_id uuid REFERENCES public.mimo_leads(id), direcao text NOT NULL CHECK(direcao IN ('recebida','enviada')), texto text NOT NULL, contato_em timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(vinculo_id,message_id)
);
GRANT SELECT ON public.mimo_whatsapp_eventos TO authenticated;
GRANT ALL ON public.mimo_whatsapp_eventos TO service_role;
ALTER TABLE public.mimo_whatsapp_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_eventos_read ON public.mimo_whatsapp_eventos FOR SELECT TO authenticated USING(public.is_membro_empresa(empresa_id,auth.uid()));
CREATE INDEX mimo_eventos_lead ON public.mimo_whatsapp_eventos(empresa_id,lead_id,contato_em DESC);
CREATE TABLE public.mimo_whatsapp_diagnosticos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id), vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id), message_id text, codigo text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mimo_whatsapp_diagnosticos TO authenticated;
GRANT ALL ON public.mimo_whatsapp_diagnosticos TO service_role;
ALTER TABLE public.mimo_whatsapp_diagnosticos ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_diagnosticos_read ON public.mimo_whatsapp_diagnosticos FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
ALTER TABLE public.mimo_leads ADD COLUMN primeiro_contato_whatsapp_em timestamptz, ADD COLUMN ultimo_contato_whatsapp_em timestamptz;
CREATE OR REPLACE FUNCTION public.mimo_receber_whatsapp(_vinculo uuid,_owner uuid,_token_sha256 text,_message_id text,_telefone text,_nome text,_texto text,_contato_em timestamptz,_from_me boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.mimo_whatsapp_vinculos; n text; l uuid; evento uuid;
BEGIN
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND ativo AND owner_id=_owner AND token_sha256=_token_sha256 FOR UPDATE;
 IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=v.empresa_id AND slug='mimo' AND ativa) OR NOT public.tem_papel_empresa(v.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 IF length(_message_id)<1 OR length(_message_id)>200 OR length(_texto)>10000 OR _contato_em>now()+interval '5 minutes' OR _contato_em IS NULL THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 n:=public.mimo_normalizar_telefone(_telefone);
 IF n IS NULL OR n=public.mimo_normalizar_telefone(v.numero_comercial) THEN RETURN NULL; END IF;
 INSERT INTO public.mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,direcao,texto,contato_em) VALUES(v.empresa_id,v.id,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_texto,_contato_em) ON CONFLICT(vinculo_id,message_id) DO NOTHING RETURNING id INTO evento;
 IF evento IS NULL THEN SELECT lead_id INTO l FROM public.mimo_whatsapp_eventos WHERE vinculo_id=v.id AND message_id=_message_id; RETURN l; END IF;
 SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND telefone_normalizado=n FOR UPDATE;
 IF NOT _from_me THEN
  IF l IS NULL THEN
   INSERT INTO public.mimo_leads(empresa_id,nome_empresa,nome_contato,telefone,origem,entrada_em,created_by,primeiro_contato_whatsapp_em,ultimo_contato_whatsapp_em)
   VALUES(v.empresa_id,coalesce(nullif(left(btrim(_nome),200),''),n),coalesce(left(_nome,200),''),n,'whatsapp',_contato_em,v.confirmado_por,_contato_em,_contato_em)
   ON CONFLICT(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL DO UPDATE SET
    primeiro_contato_whatsapp_em=least(public.mimo_leads.primeiro_contato_whatsapp_em,EXCLUDED.primeiro_contato_whatsapp_em),ultimo_contato_whatsapp_em=greatest(public.mimo_leads.ultimo_contato_whatsapp_em,EXCLUDED.ultimo_contato_whatsapp_em) RETURNING id INTO l;
  ELSE
   UPDATE public.mimo_leads SET primeiro_contato_whatsapp_em=least(primeiro_contato_whatsapp_em,_contato_em),ultimo_contato_whatsapp_em=greatest(ultimo_contato_whatsapp_em,_contato_em) WHERE id=l;
  END IF;
 END IF;
 UPDATE public.mimo_whatsapp_eventos SET lead_id=l WHERE id=evento;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean) TO service_role;
COMMENT ON TABLE public.mimo_whatsapp_vinculos IS 'Vínculo comercial confirmado explicitamente fora do webhook; hash da credencial, sem token cru. Nenhum vínculo criado automaticamente.';