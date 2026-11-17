-- Public intake is mediated by the server; no anonymous table or RPC access.
CREATE TABLE public.mimo_revenda_inscricoes (
 id uuid PRIMARY KEY,
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
 telefone text NOT NULL,
 respostas jsonb NOT NULL CHECK(jsonb_typeof(respostas)='object'),
 minimo_centavos integer NOT NULL DEFAULT 150000 CHECK(minimo_centavos=150000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX mimo_revenda_lead ON public.mimo_revenda_inscricoes(empresa_id,lead_id,created_at DESC);
CREATE INDEX mimo_revenda_telefone ON public.mimo_revenda_inscricoes(empresa_id,telefone,created_at DESC);
ALTER TABLE public.mimo_revenda_inscricoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_revenda_inscricoes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mimo_revenda_inscricoes TO authenticated;
GRANT SELECT,INSERT ON public.mimo_revenda_inscricoes TO service_role;
CREATE POLICY mimo_revenda_read ON public.mimo_revenda_inscricoes FOR SELECT TO authenticated
 USING (public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor','vendedor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.mimo_leads l WHERE l.id=lead_id AND l.empresa_id=mimo_revenda_inscricoes.empresa_id AND public.pode_ver_mimo_lead(l.id,auth.uid())));
CREATE TABLE public.mimo_revenda_limites (
 ip_hash text PRIMARY KEY CHECK(ip_hash ~ '^[a-f0-9]{64}$'),
 inicio timestamptz NOT NULL, quantidade integer NOT NULL CHECK(quantidade>0)
);
ALTER TABLE public.mimo_revenda_limites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_revenda_limites FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.mimo_revenda_limites TO service_role;
-- Match only form-linked aliases; preserve ordinary WhatsApp resolution otherwise.
CREATE FUNCTION public.mimo_revenda_lead_por_telefone(p_empresa uuid,p_telefone text) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT f.lead_id FROM public.mimo_revenda_inscricoes f
 JOIN public.mimo_leads l ON l.id=f.lead_id AND l.empresa_id=f.empresa_id
 WHERE f.empresa_id=p_empresa AND p_telefone ~ '^55[1-9]{2}[0-9]{8,9}$'
 AND f.telefone=CASE WHEN p_telefone ~ '^55[1-9]{2}[6-9][0-9]{7}$' THEN substr(p_telefone,1,4)||'9'||substr(p_telefone,5) ELSE p_telefone END
 ORDER BY f.created_at DESC,f.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.mimo_revenda_lead_por_telefone(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_revenda_lead_por_telefone(uuid,text) TO service_role;
CREATE FUNCTION public.mimo_inscrever_revenda(p_dados jsonb,p_ip_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e uuid; dono uuid; destino text; telefone_n text; legado text; ficha uuid; l uuid; d jsonb; anterior jsonb; n integer; perfil_n text;
BEGIN
 IF coalesce(jsonb_typeof(p_dados),'')<>'object' OR coalesce(p_ip_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid intake'; END IF;
 IF coalesce(p_dados->>'interesse','')<>'revenda' OR coalesce(p_dados->>'investimento','')<>'sim'
  OR p_dados->'consentimento' IS DISTINCT FROM 'true'::jsonb
  OR coalesce(p_dados->>'canal','') NOT IN ('loja','emporio','distribuidor','internet','comecando')
  OR coalesce(p_dados->>'prazo','') NOT IN ('agora','trinta_dias','pesquisando')
  OR coalesce(p_dados->>'uf','') NOT IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')
  OR coalesce(length(btrim(p_dados->>'nome')),0) NOT BETWEEN 3 AND 150
  OR coalesce(length(btrim(p_dados->>'cidade')),0) NOT BETWEEN 2 AND 100
  OR length(coalesce(p_dados->>'utm_source',''))>100 OR length(coalesce(p_dados->>'utm_campaign',''))>150 OR length(coalesce(p_dados->>'utm_content',''))>150
  OR coalesce(p_dados->>'site','')<>'' THEN RAISE EXCEPTION 'Invalid intake'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(p_dados) x WHERE x.key IN ('nome','cidade','utm_source','utm_campaign','utm_content') AND x.value ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'Invalid text'; END IF;
 ficha=(p_dados->>'envio_id')::uuid;
 IF ficha IS NULL THEN RAISE EXCEPTION 'Missing submission'; END IF;
 telefone_n='55'||public.mimo_influenciador_telefone(p_dados->>'whatsapp');
 IF telefone_n IS NULL THEN RAISE EXCEPTION 'Missing phone'; END IF;
 SELECT id INTO e FROM public.empresas WHERE slug='mimo' AND ativa;
 -- Destination approved by the owner. A changed binding must not silently route elsewhere.
 SELECT v.owner_id,public.mimo_normalizar_telefone(v.numero_comercial) INTO dono,destino
 FROM public.mimo_whatsapp_vinculos v JOIN public.mimo_agente_config c ON c.vinculo_id=v.id AND c.empresa_id=v.empresa_id
 WHERE v.empresa_id=e AND v.ativo AND v.finalidade='entrada' AND v.confirmado_em IS NOT NULL
  AND public.mimo_normalizar_telefone(v.numero_comercial)='555391280424';
 IF e IS NULL OR dono IS NULL OR destino IS NULL THEN RAISE EXCEPTION 'Intake unavailable'; END IF;
 d=jsonb_build_object('interesse','revenda','canal',p_dados->>'canal','cidade',btrim(p_dados->>'cidade'),'uf',p_dados->>'uf',
  'investimento','sim','prazo',p_dados->>'prazo','nome',btrim(p_dados->>'nome'),'whatsapp',telefone_n,'consentimento',true,
  'utm_source',btrim(coalesce(p_dados->>'utm_source','')),'utm_campaign',btrim(coalesce(p_dados->>'utm_campaign','')),'utm_content',btrim(coalesce(p_dados->>'utm_content','')));
 PERFORM pg_advisory_xact_lock(hashtextextended('mimo-revenda-envio:'||ficha::text,0));
 SELECT respostas INTO anterior FROM public.mimo_revenda_inscricoes WHERE id=ficha AND empresa_id=e;
 IF anterior IS NOT NULL THEN
  IF anterior<>d THEN RETURN jsonb_build_object('estado','conflito'); END IF;
  RETURN jsonb_build_object('estado','recebido','numero',destino);
 END IF;
 INSERT INTO public.mimo_revenda_limites(ip_hash,inicio,quantidade) VALUES(p_ip_hash,clock_timestamp(),1)
 ON CONFLICT(ip_hash) DO UPDATE SET
 quantidade=CASE WHEN mimo_revenda_limites.inicio<clock_timestamp()-interval '1 hour' THEN 1 ELSE least(mimo_revenda_limites.quantidade+1,11) END,
 inicio=CASE WHEN mimo_revenda_limites.inicio<clock_timestamp()-interval '1 hour' THEN clock_timestamp() ELSE mimo_revenda_limites.inicio END
 RETURNING quantidade INTO n;
 IF n>10 THEN RETURN jsonb_build_object('estado','limite'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mimo-revenda-fone:'||e::text||telefone_n,0));
 IF (SELECT count(*) FROM public.mimo_revenda_inscricoes WHERE empresa_id=e AND telefone=telefone_n AND created_at>clock_timestamp()-interval '24 hours')>=3 THEN RETURN jsonb_build_object('estado','limite'); END IF;
 perfil_n=CASE p_dados->>'canal' WHEN 'emporio' THEN 'emporio' WHEN 'distribuidor' THEN 'distribuidor' ELSE 'outro' END;
 legado=CASE WHEN telefone_n ~ '^55[1-9]{2}9[6-9][0-9]{7}$' THEN substr(telefone_n,1,4)||substr(telefone_n,6) ELSE telefone_n END;
 -- Same locks as inbound ingestion, acquired in a stable order for both forms.
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text||least(legado,telefone_n),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(e::text||greatest(legado,telefone_n),0));
 SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=e AND telefone_normalizado IN (telefone_n,legado)
 ORDER BY (telefone_normalizado=telefone_n) DESC LIMIT 1 FOR KEY SHARE;
 IF l IS NULL THEN
 INSERT INTO public.mimo_leads(empresa_id,nome_empresa,nome_contato,telefone,perfil,origem,campanha_origem,anuncio_origem,observacoes,created_by)
 VALUES(e,btrim(p_dados->>'nome'),btrim(p_dados->>'nome'),telefone_n,perfil_n,
 CASE WHEN lower(d->>'utm_source') IN ('meta','facebook','instagram','fb','ig') THEN 'meta_ads' ELSE 'organico' END,
 coalesce(nullif(d->>'utm_campaign',''),'formulario_revenda_1500'),d->>'utm_content',
 'Formulario de revenda: confirmou disposicao para pedido inicial de R$ 1.500. Consulte as respostas na ficha de revenda. Declaracao do interessado; nao comprova compra ou pagamento.',dono)
 ON CONFLICT(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL DO NOTHING RETURNING id INTO l;
 IF l IS NULL THEN SELECT id INTO l FROM public.mimo_leads WHERE empresa_id=e AND telefone_normalizado=telefone_n FOR KEY SHARE; END IF;
 END IF;
 IF l IS NULL THEN RAISE EXCEPTION 'Lead unavailable'; END IF;
 -- Never overwrite an existing salesperson's assignment, status, notes or order data.
 INSERT INTO public.mimo_revenda_inscricoes(id,empresa_id,lead_id,telefone,respostas) VALUES(ficha,e,l,telefone_n,d);
 RETURN jsonb_build_object('estado','recebido','numero',destino);
END $$;
REVOKE ALL ON FUNCTION public.mimo_inscrever_revenda(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_inscrever_revenda(jsonb,text) TO service_role;

