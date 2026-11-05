-- PREPARADA, NÃO APLICADA. Publicar processador e conferir backup antes de ativar.
CREATE TABLE public.mimo_recuperacao_config (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id), loja_id text NOT NULL,
 vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id),
 ativo boolean NOT NULL DEFAULT false, inicio_em timestamptz NOT NULL DEFAULT now(),
 ator_id uuid NOT NULL REFERENCES auth.users(id), atualizado_em timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(empresa_id,loja_id) REFERENCES public.mimo_nuvem_lojas(empresa_id,loja_id)
);
CREATE TABLE public.mimo_recuperacao_supressoes (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), telefone text NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(), motivo text NOT NULL,
 PRIMARY KEY(empresa_id,telefone), CHECK(telefone ~ '^[1-9][0-9]{9,14}$')
);
CREATE TABLE public.mimo_recuperacao_fila (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL, loja_id text NOT NULL,
 checkout_id text NOT NULL, token_hash text NOT NULL, telefone text NOT NULL,
 canal text NOT NULL DEFAULT 'whatsapp' CHECK(canal='whatsapp'), etapa smallint NOT NULL DEFAULT 1 CHECK(etapa=1),
 previsto_em timestamptz NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','reservada','enviando','enviada','bloqueada','incerta')),
 reserva uuid, reservado_em timestamptz, enviada_em timestamptz, message_id text, motivo text,
 UNIQUE(empresa_id,loja_id,token_hash,canal,etapa),
 FOREIGN KEY(empresa_id,loja_id,checkout_id) REFERENCES public.mimo_nuvem_carrinhos(empresa_id,loja_id,checkout_id),
 CHECK(telefone ~ '^[1-9][0-9]{9,14}$'), CHECK(token_hash ~ '^[a-f0-9]{64}$')
);
CREATE INDEX ON public.mimo_recuperacao_fila(previsto_em) WHERE estado='pendente';
-- O recebimento autenticado já vincula o evento ao contato dentro da mesma empresa.
-- Executar após esse vínculo mantém a supressão na mesma transação do webhook.
CREATE FUNCTION public.mimo_recuperacao_receber_parada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n text;
BEGIN
 IF NEW.direcao<>'recebida' OR NEW.lead_id IS NULL THEN RETURN NEW; END IF;
 -- Qualquer resposta encaminha o contato ao atendimento e encerra os lembretes.
 -- Assim pedidos de parada em linguagem livre também são respeitados.
 SELECT telefone_normalizado INTO n FROM public.mimo_leads WHERE id=NEW.lead_id AND empresa_id=NEW.empresa_id;
 IF n IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.mimo_recuperacao_supressoes(empresa_id,telefone,motivo) VALUES(NEW.empresa_id,n,'resposta_recebida') ON CONFLICT DO NOTHING;
 UPDATE public.mimo_recuperacao_fila SET estado='bloqueada',motivo='resposta_recebida' WHERE empresa_id=NEW.empresa_id AND telefone=n AND estado IN ('pendente','reservada');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mimo_recuperacao_receber_parada() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER mimo_recuperacao_parada AFTER INSERT OR UPDATE OF lead_id ON public.mimo_whatsapp_eventos
 FOR EACH ROW EXECUTE FUNCTION public.mimo_recuperacao_receber_parada();
ALTER TABLE public.mimo_recuperacao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_recuperacao_supressoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_recuperacao_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mimo_recuperacao_config,public.mimo_recuperacao_supressoes,public.mimo_recuperacao_fila FROM anon,authenticated,service_role;
GRANT SELECT ON public.mimo_recuperacao_config,public.mimo_recuperacao_fila TO authenticated;
GRANT SELECT ON public.mimo_recuperacao_config,public.mimo_recuperacao_fila,public.mimo_recuperacao_supressoes,public.mimo_nuvem_carrinhos,public.mimo_nuvem_pedidos TO service_role;
CREATE POLICY recuperacao_config_gestao ON public.mimo_recuperacao_config FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));
CREATE POLICY recuperacao_fila_gestao ON public.mimo_recuperacao_fila FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]) AND EXISTS(SELECT 1 FROM public.empresas WHERE id=empresa_id AND slug='mimo' AND ativa));

CREATE FUNCTION public.mimo_recuperacao_reservar(_empresa uuid) RETURNS SETOF public.mimo_recuperacao_fila
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_recuperacao_config; trabalho uuid;
BEGIN
 SELECT * INTO cfg FROM public.mimo_recuperacao_config WHERE empresa_id=_empresa AND ativo;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,cfg.ator_id);
 IF NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=cfg.vinculo_id AND empresa_id=_empresa AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[])) THEN RETURN; END IF;
 IF extract(hour FROM clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') NOT BETWEEN 9 AND 17 THEN RETURN; END IF;
 -- Uma reserva abandonada nunca é reenviada: pode ter alcançado o provedor.
 UPDATE public.mimo_recuperacao_fila SET estado='incerta',motivo='processamento_interrompido'
 WHERE empresa_id=_empresa AND estado IN ('reservada','enviando') AND reservado_em<clock_timestamp()-interval '5 minutes';
 INSERT INTO public.mimo_recuperacao_fila(empresa_id,loja_id,checkout_id,token_hash,telefone,previsto_em)
 SELECT c.empresa_id,c.loja_id,c.checkout_id,c.token_hash,public.mimo_normalizar_telefone(c.telefone),c.origem_updated_at+interval '2 hours'
 FROM public.mimo_nuvem_carrinhos c WHERE c.empresa_id=_empresa AND c.loja_id=cfg.loja_id
 AND c.origem_created_at>=cfg.inicio_em AND c.origem_updated_at<=clock_timestamp()
 AND c.origem_updated_at>clock_timestamp()-interval '30 days' AND c.url IS NOT NULL
 AND public.mimo_normalizar_telefone(c.telefone) IS NOT NULL
 ON CONFLICT(empresa_id,loja_id,token_hash,canal,etapa) DO NOTHING;
 UPDATE public.mimo_recuperacao_fila f SET estado='bloqueada',motivo='compra_ou_supressao'
 WHERE f.empresa_id=_empresa AND f.estado='pendente' AND (
 EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=f.empresa_id AND p.loja_id=f.loja_id AND p.token_hash=f.token_hash)
 OR EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=f.empresa_id AND s.telefone=f.telefone));
 SELECT id INTO trabalho FROM public.mimo_recuperacao_fila WHERE empresa_id=_empresa AND loja_id=cfg.loja_id
 AND estado='pendente' AND previsto_em<=clock_timestamp() ORDER BY previsto_em,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF trabalho IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE public.mimo_recuperacao_fila SET estado='reservada',reserva=gen_random_uuid(),reservado_em=clock_timestamp()
 WHERE id=trabalho RETURNING *;
END $$;

CREATE FUNCTION public.mimo_recuperacao_autorizar(_id uuid,_reserva uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.mimo_recuperacao_fila; cfg public.mimo_recuperacao_config;
BEGIN
 SELECT * INTO f FROM public.mimo_recuperacao_fila WHERE id=_id AND reserva=_reserva AND estado='reservada' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO cfg FROM public.mimo_recuperacao_config WHERE empresa_id=f.empresa_id AND ativo FOR SHARE;
 IF FOUND THEN PERFORM public.mimo_nuvem_oauth_acesso(cfg.empresa_id,cfg.ator_id); END IF;
 IF cfg.empresa_id IS NULL OR cfg.loja_id<>f.loja_id
 OR f.reservado_em<clock_timestamp()-interval '1 minute'
 OR extract(hour FROM clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') NOT BETWEEN 9 AND 17
 OR NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=cfg.vinculo_id AND empresa_id=f.empresa_id AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[]))
 OR EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=f.empresa_id AND p.loja_id=f.loja_id AND p.token_hash=f.token_hash)
 OR EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=f.empresa_id AND s.telefone=f.telefone)
 OR NOT EXISTS(SELECT 1 FROM public.mimo_nuvem_carrinhos c WHERE c.empresa_id=f.empresa_id AND c.loja_id=f.loja_id AND c.checkout_id=f.checkout_id
 AND c.token_hash=f.token_hash AND public.mimo_normalizar_telefone(c.telefone)=f.telefone AND c.url IS NOT NULL
 AND c.origem_created_at>=cfg.inicio_em AND c.origem_updated_at>clock_timestamp()-interval '30 days'
 AND c.origem_updated_at+interval '2 hours'<=clock_timestamp())
 THEN UPDATE public.mimo_recuperacao_fila SET estado='bloqueada',motivo='verificacao_final' WHERE id=f.id; RETURN false; END IF;
 UPDATE public.mimo_recuperacao_fila SET estado='enviando' WHERE id=f.id;
 RETURN true;
END $$;

CREATE FUNCTION public.mimo_recuperacao_concluir(_id uuid,_reserva uuid,_estado text,_message_id text DEFAULT NULL,_motivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF _estado NOT IN ('enviada','incerta','bloqueada') OR (_estado='enviada' AND coalesce(length(_message_id),0) NOT BETWEEN 1 AND 300) THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
 UPDATE public.mimo_recuperacao_fila SET estado=_estado,message_id=CASE WHEN _estado='enviada' THEN _message_id END,
 enviada_em=CASE WHEN _estado='enviada' THEN clock_timestamp() END,motivo=left(_motivo,100)
 WHERE id=_id AND reserva=_reserva AND ((estado='enviando' AND _estado IN ('enviada','incerta')) OR (estado='reservada' AND _estado='bloqueada'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Reserva inválida'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.mimo_recuperacao_reservar(uuid),public.mimo_recuperacao_autorizar(uuid,uuid),public.mimo_recuperacao_concluir(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_recuperacao_reservar(uuid),public.mimo_recuperacao_autorizar(uuid,uuid),public.mimo_recuperacao_concluir(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.mimo_recuperacao_configurar(_empresa uuid,_loja text,_vinculo uuid,_ator uuid,_ativo boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended('mimo-recuperacao:'||_empresa::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.mimo_nuvem_lojas WHERE empresa_id=_empresa AND loja_id=_loja)
 OR NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND empresa_id=_empresa AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[])) THEN RAISE EXCEPTION 'Conexões não confirmadas'; END IF;
 INSERT INTO public.mimo_recuperacao_config(empresa_id,loja_id,vinculo_id,ator_id,ativo,inicio_em)
 VALUES(_empresa,_loja,_vinculo,_ator,_ativo,clock_timestamp())
 ON CONFLICT(empresa_id) DO UPDATE SET loja_id=_loja,vinculo_id=_vinculo,ator_id=_ator,ativo=_ativo,
 inicio_em=CASE WHEN NOT mimo_recuperacao_config.ativo AND _ativo THEN clock_timestamp() ELSE mimo_recuperacao_config.inicio_em END,atualizado_em=clock_timestamp();
END $$;
REVOKE ALL ON FUNCTION public.mimo_recuperacao_configurar(uuid,text,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_recuperacao_configurar(uuid,text,uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.mimo_recuperacao_indicadores(_empresa uuid,_ator uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 SELECT jsonb_build_object(
 'ativa',coalesce((SELECT ativo FROM public.mimo_recuperacao_config WHERE empresa_id=_empresa),false),
 'inicioEm',(SELECT inicio_em FROM public.mimo_recuperacao_config WHERE empresa_id=_empresa),
 'pendentes',count(*) FILTER(WHERE f.estado IN ('pendente','reservada','enviando')),
 'enviadas',count(*) FILTER(WHERE f.estado='enviada'),
 'incertas',count(*) FILTER(WHERE f.estado='incerta'),
 'bloqueadas',count(*) FILTER(WHERE f.estado='bloqueada'),
 'compras',count(*) FILTER(WHERE f.estado='enviada' AND p.pagamento='paid' AND p.status<>'cancelled'),
 'valorCentavos',coalesce(sum(p.total) FILTER(WHERE f.estado='enviada' AND p.pagamento='paid' AND p.status<>'cancelled' AND p.moeda='BRL'),0)::text)
 INTO resultado FROM public.mimo_recuperacao_fila f LEFT JOIN public.mimo_nuvem_pedidos p
 ON p.empresa_id=f.empresa_id AND p.loja_id=f.loja_id AND p.token_hash=f.token_hash AND p.origem_created_at>=f.enviada_em
 WHERE f.empresa_id=_empresa;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.mimo_recuperacao_indicadores(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_recuperacao_indicadores(uuid,uuid) TO service_role;

CREATE FUNCTION public.mimo_recuperacao_pausar(_empresa uuid,_ator uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 UPDATE public.mimo_recuperacao_config SET ativo=false,atualizado_em=clock_timestamp(),ator_id=_ator WHERE empresa_id=_empresa;
END $$;
REVOKE ALL ON FUNCTION public.mimo_recuperacao_pausar(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_recuperacao_pausar(uuid,uuid) TO service_role;

ALTER TABLE public.mimo_nuvem_pedidos ADD COLUMN origem_created_at timestamptz;
CREATE OR REPLACE FUNCTION public.mimo_nuvem_sincronizar(_empresa uuid,_loja text,_ator uuid,_carrinhos jsonb,_pedidos jsonb)
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
 FOR e IN SELECT value FROM jsonb_array_elements(_pedidos) LOOP
 IF e->>'origem_created_at' IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos WHERE empresa_id=_empresa AND loja_id=_loja AND pedido_id=e->>'pedido_id' AND origem_created_at IS NOT NULL AND origem_created_at<>(e->>'origem_created_at')::timestamptz) THEN RAISE EXCEPTION 'Data de origem divergente'; END IF;
 UPDATE public.mimo_nuvem_pedidos SET origem_created_at=(e->>'origem_created_at')::timestamptz WHERE empresa_id=_empresa AND loja_id=_loja AND pedido_id=e->>'pedido_id' AND token_hash=e->>'token_hash' AND origem_created_at IS NULL;
 END IF;
 END LOOP;
END $$;
