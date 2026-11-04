-- Backup recuperável confirmado em docs/mimo-carteira-implementacao.md.
CREATE TABLE public.mimo_pricing_documentos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 tipo text NOT NULL CHECK(tipo IN ('base','cenario')), versao integer NOT NULL DEFAULT 1,
 dados jsonb NOT NULL CHECK(jsonb_typeof(dados)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id), updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mimo_pricing_base_unica ON public.mimo_pricing_documentos(empresa_id) WHERE tipo='base';
CREATE INDEX ON public.mimo_pricing_documentos(empresa_id,updated_at DESC);
CREATE TABLE public.mimo_pricing_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 documento_id uuid NOT NULL REFERENCES public.mimo_pricing_documentos(id), versao integer NOT NULL,
 dados jsonb NOT NULL, autor uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 origem text, hash text, UNIQUE(documento_id,versao), UNIQUE(empresa_id,hash)
);
ALTER TABLE public.mimo_pricing_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_pricing_historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_pricing_documentos,public.mimo_pricing_historico FROM anon,authenticated;
GRANT SELECT ON public.mimo_pricing_documentos,public.mimo_pricing_historico TO authenticated;
CREATE POLICY pricing_ler ON public.mimo_pricing_documentos FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
CREATE POLICY pricing_historico_ler ON public.mimo_pricing_historico FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
CREATE FUNCTION public.mimo_pricing_salvar(_empresa uuid,_id uuid,_versao integer,_tipo text,_dados jsonb,_hash text DEFAULT NULL,_origem text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE atual public.mimo_pricing_documentos; cid uuid; item jsonb;
BEGIN
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=auth.uid() AND ativo AND papel IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF _tipo NOT IN ('base','cenario') OR jsonb_typeof(_dados->'linhas')<>'array' OR jsonb_array_length(_dados->'linhas') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Documento inválido'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_dados->'linhas') l GROUP BY l->>'codigo',l->>'canal' HAVING count(*)>1) THEN RAISE EXCEPTION 'SKU/canal duplicado'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_dados->'linhas') LOOP
 IF item->>'canal' NOT IN ('Venda Direta','Distribuidor','Televendas','E-commerce','Marketplace','Broker') OR coalesce(item->>'codigo','')='' THEN RAISE EXCEPTION 'SKU/canal inválido'; END IF;
 END LOOP;
 -- Client references must belong to this company, including policy-level references.
 FOR item IN SELECT jsonb_build_object('cliente',_dados->'cliente') UNION ALL SELECT value FROM jsonb_array_elements(coalesce(_dados->'politicas','[]')) LOOP
 IF item->>'cliente' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mimo_carteira_unidades WHERE id=(item->>'cliente')::uuid AND empresa_id=_empresa) THEN RAISE EXCEPTION 'Cliente de outra empresa ou inexistente'; END IF;
 END LOOP;
 IF _hash IS NOT NULL AND EXISTS(SELECT 1 FROM public.mimo_pricing_historico WHERE empresa_id=_empresa AND hash=_hash) THEN RAISE EXCEPTION 'Arquivo já importado'; END IF;
 IF _id IS NULL THEN
 IF _versao<>0 THEN RAISE EXCEPTION 'Versão inválida'; END IF;
 INSERT INTO public.mimo_pricing_documentos(empresa_id,tipo,dados,created_by,updated_by) VALUES(_empresa,_tipo,_dados,auth.uid(),auth.uid()) RETURNING * INTO atual;
 ELSE
 SELECT * INTO atual FROM public.mimo_pricing_documentos WHERE id=_id AND empresa_id=_empresa FOR UPDATE;
 IF NOT FOUND OR atual.versao<>_versao OR atual.tipo<>_tipo THEN RAISE EXCEPTION 'Estudo alterado. Reabra antes de salvar'; END IF;
 UPDATE public.mimo_pricing_documentos SET dados=_dados,versao=versao+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE id=_id RETURNING * INTO atual;
 END IF;
 INSERT INTO public.mimo_pricing_historico(empresa_id,documento_id,versao,dados,autor,origem,hash) VALUES(_empresa,atual.id,atual.versao,_dados,auth.uid(),_origem,_hash);
 RETURN atual.id;
END $$;
REVOKE ALL ON FUNCTION public.mimo_pricing_salvar(uuid,uuid,integer,text,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_pricing_salvar(uuid,uuid,integer,text,jsonb,text,text) TO authenticated;
