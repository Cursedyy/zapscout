-- PREPARADA, NÃO APLICADA. Exige verificação de backup antes de aplicar.
CREATE TABLE public.mimo_nuvem_lojas (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
 loja_id text NOT NULL UNIQUE CHECK(loja_id ~ '^[1-9][0-9]{0,18}$'),
 sincronizado_em timestamptz NOT NULL DEFAULT now(),
 sincronizado_por uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(empresa_id,loja_id)
);
CREATE TABLE public.mimo_nuvem_carrinhos (
 empresa_id uuid NOT NULL, loja_id text NOT NULL,
 checkout_id text NOT NULL CHECK(checkout_id ~ '^[1-9][0-9]{0,18}$'),
 token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 nome text NOT NULL CHECK(length(nome)<=300),
 email text NOT NULL CHECK(length(email)<=300), telefone text NOT NULL CHECK(length(telefone)<=30),
 total bigint NOT NULL CHECK(total BETWEEN 0 AND 9007199254740991),
 moeda text NOT NULL CHECK(moeda ~ '^[A-Z]{3}$'), url text CHECK(length(url)<=2000 AND url LIKE 'https://%'),
 itens jsonb NOT NULL CHECK(jsonb_typeof(itens)='array' AND jsonb_array_length(itens)<=1000),
 origem_created_at timestamptz NOT NULL, origem_updated_at timestamptz NOT NULL,
 PRIMARY KEY(empresa_id,loja_id,checkout_id), UNIQUE(empresa_id,loja_id,token_hash),
 FOREIGN KEY(empresa_id,loja_id) REFERENCES public.mimo_nuvem_lojas(empresa_id,loja_id)
);
CREATE TABLE public.mimo_nuvem_pedidos (
 empresa_id uuid NOT NULL, loja_id text NOT NULL,
 pedido_id text NOT NULL CHECK(pedido_id ~ '^[1-9][0-9]{0,18}$'),
 token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 numero text NOT NULL CHECK(numero ~ '^[1-9][0-9]{0,18}$'),
 status text NOT NULL CHECK(status IN ('open','closed','cancelled')),
 pagamento text NOT NULL CHECK(pagamento IN ('authorized','pending','paid','partially_paid','abandoned','refunded','partially_refunded','voided')),
 total bigint NOT NULL CHECK(total BETWEEN 0 AND 9007199254740991),
 moeda text NOT NULL CHECK(moeda ~ '^[A-Z]{3}$'), origem_updated_at timestamptz NOT NULL,
 PRIMARY KEY(empresa_id,loja_id,pedido_id), UNIQUE(empresa_id,loja_id,token_hash),
 FOREIGN KEY(empresa_id,loja_id) REFERENCES public.mimo_nuvem_lojas(empresa_id,loja_id)
);
CREATE INDEX ON public.mimo_nuvem_carrinhos(empresa_id,origem_updated_at DESC,checkout_id);
ALTER TABLE public.mimo_nuvem_lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_nuvem_carrinhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_nuvem_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_nuvem_lojas,public.mimo_nuvem_carrinhos,public.mimo_nuvem_pedidos FROM anon,authenticated,service_role;
GRANT SELECT ON public.mimo_nuvem_lojas,public.mimo_nuvem_carrinhos,public.mimo_nuvem_pedidos TO authenticated;
CREATE POLICY nuvem_lojas_ler ON public.mimo_nuvem_lojas FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE POLICY nuvem_carrinhos_ler ON public.mimo_nuvem_carrinhos FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE POLICY nuvem_pedidos_ler ON public.mimo_nuvem_pedidos FOR SELECT TO authenticated USING (
 public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[])
 AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa)
);
CREATE FUNCTION public.mimo_nuvem_sincronizar(_empresa uuid,_loja text,_ator uuid,_carrinhos jsonb,_pedidos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e jsonb;
BEGIN
 -- Only a trusted server calls this with the middleware-verified actor and configured binding.
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator
   AND ativo AND papel IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF jsonb_typeof(_carrinhos) IS DISTINCT FROM 'array' OR jsonb_typeof(_pedidos) IS DISTINCT FROM 'array'
   OR jsonb_array_length(_carrinhos)>10000 OR jsonb_array_length(_pedidos)>10000 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text,0));
 IF EXISTS(SELECT 1 FROM public.mimo_nuvem_lojas WHERE empresa_id=_empresa AND loja_id<>_loja)
   THEN RAISE EXCEPTION 'Vínculo da loja não pode mudar'; END IF;
 INSERT INTO public.mimo_nuvem_lojas(empresa_id,loja_id,sincronizado_por) VALUES(_empresa,_loja,_ator)
 ON CONFLICT(empresa_id) DO UPDATE SET sincronizado_em=clock_timestamp(),sincronizado_por=_ator;
 FOR e IN SELECT value FROM jsonb_array_elements(_carrinhos) LOOP
   IF EXISTS(SELECT 1 FROM public.mimo_nuvem_carrinhos WHERE empresa_id=_empresa AND loja_id=_loja
     AND checkout_id=e->>'checkout_id' AND token_hash<>e->>'token_hash') THEN RAISE EXCEPTION 'Identidade divergente'; END IF;
   INSERT INTO public.mimo_nuvem_carrinhos AS c(empresa_id,loja_id,checkout_id,token_hash,nome,email,telefone,total,moeda,url,itens,origem_created_at,origem_updated_at)
   VALUES(_empresa,_loja,e->>'checkout_id',e->>'token_hash',e->>'nome',e->>'email',e->>'telefone',(e->>'total')::bigint,e->>'moeda',e->>'url',e->'itens',(e->>'origem_created_at')::timestamptz,(e->>'origem_updated_at')::timestamptz)
   ON CONFLICT(empresa_id,loja_id,checkout_id) DO UPDATE SET nome=EXCLUDED.nome,email=EXCLUDED.email,
     telefone=EXCLUDED.telefone,total=EXCLUDED.total,moeda=EXCLUDED.moeda,url=EXCLUDED.url,itens=EXCLUDED.itens,
     origem_updated_at=EXCLUDED.origem_updated_at WHERE EXCLUDED.origem_updated_at>c.origem_updated_at;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(_pedidos) LOOP
   IF EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos WHERE empresa_id=_empresa AND loja_id=_loja
     AND pedido_id=e->>'pedido_id' AND token_hash<>e->>'token_hash') THEN RAISE EXCEPTION 'Identidade divergente'; END IF;
   INSERT INTO public.mimo_nuvem_pedidos AS p(empresa_id,loja_id,pedido_id,token_hash,numero,status,pagamento,total,moeda,origem_updated_at)
   VALUES(_empresa,_loja,e->>'pedido_id',e->>'token_hash',e->>'numero',e->>'status',e->>'pagamento',(e->>'total')::bigint,e->>'moeda',(e->>'origem_updated_at')::timestamptz)
   ON CONFLICT(empresa_id,loja_id,pedido_id) DO UPDATE SET status=EXCLUDED.status,pagamento=EXCLUDED.pagamento,
     total=EXCLUDED.total,moeda=EXCLUDED.moeda,origem_updated_at=EXCLUDED.origem_updated_at WHERE EXCLUDED.origem_updated_at>p.origem_updated_at;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mimo_nuvem_sincronizar(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_nuvem_sincronizar(uuid,text,uuid,jsonb,jsonb) TO service_role;
