-- Reconciliar textos UTF-8 das duas RPCs manuais; regras e dados preservados.
CREATE OR REPLACE FUNCTION public.mimo_recuperacao_diagnostico(_empresa uuid,_ator uuid,_checkouts text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE resultado jsonb;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 IF coalesce(array_length(_checkouts,1),0)>30 THEN RAISE EXCEPTION 'Página inválida'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.checkout_id,'estado',x.estado,
   'motivo',x.motivo,'podeEnviar',x.pode_enviar,'enviadaEm',x.enviada_em,'manual',x.solicitado_por IS NOT NULL)), '[]'::jsonb)
 INTO resultado FROM (
 SELECT c.checkout_id,f.estado,f.enviada_em,f.solicitado_por,
 CASE
 WHEN f.estado IN ('enviada','incerta','reservada','enviando','bloqueada') THEN f.estado
 WHEN EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=c.empresa_id AND p.loja_id=c.loja_id AND p.token_hash=c.token_hash) THEN 'compra'
 WHEN EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=c.empresa_id AND s.telefone=public.mimo_normalizar_telefone(c.telefone)) THEN 'resposta'
 WHEN c.url IS NULL OR public.mimo_normalizar_telefone(c.telefone) IS NULL THEN 'sem_destino'
 WHEN c.origem_updated_at<=clock_timestamp()-interval '30 days' THEN 'expirado'
 WHEN c.origem_updated_at+interval '2 hours'>clock_timestamp() THEN 'aguardando'
 WHEN cfg.empresa_id IS NULL THEN 'sem_configuracao'
 WHEN c.origem_created_at<cfg.inicio_em THEN 'historico'
 WHEN NOT cfg.ativo THEN 'pausada'
 ELSE 'fila' END AS motivo,
 cfg.empresa_id IS NOT NULL AND (f.id IS NULL OR f.estado='pendente')
 AND c.url IS NOT NULL AND public.mimo_normalizar_telefone(c.telefone) IS NOT NULL
 AND c.origem_updated_at>clock_timestamp()-interval '30 days'
 AND c.origem_updated_at+interval '2 hours'<=clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=c.empresa_id AND p.loja_id=c.loja_id AND p.token_hash=c.token_hash)
 AND NOT EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=c.empresa_id AND s.telefone=public.mimo_normalizar_telefone(c.telefone)) AS pode_enviar
 FROM public.mimo_nuvem_carrinhos c
 LEFT JOIN public.mimo_recuperacao_config cfg ON cfg.empresa_id=c.empresa_id AND cfg.loja_id=c.loja_id
 LEFT JOIN public.mimo_recuperacao_fila f ON f.empresa_id=c.empresa_id AND f.loja_id=c.loja_id AND f.token_hash=c.token_hash AND f.canal='whatsapp' AND f.etapa=1
 WHERE c.empresa_id=_empresa AND c.checkout_id=ANY(_checkouts)
 ) x;
 RETURN resultado;
END $$;
CREATE OR REPLACE FUNCTION public.mimo_recuperacao_reservar_manual(_empresa uuid,_loja text,_ator uuid,_checkout text)
RETURNS SETOF public.mimo_recuperacao_fila
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_recuperacao_config; c public.mimo_nuvem_carrinhos;
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 SELECT * INTO cfg FROM public.mimo_recuperacao_config WHERE empresa_id=_empresa AND loja_id=_loja FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configure a recuperação antes do envio manual'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=cfg.vinculo_id AND empresa_id=_empresa AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[])) THEN RETURN; END IF;
 SELECT * INTO c FROM public.mimo_nuvem_carrinhos WHERE empresa_id=_empresa AND loja_id=_loja AND checkout_id=_checkout FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 IF c.url IS NULL OR public.mimo_normalizar_telefone(c.telefone) IS NULL
 OR c.origem_updated_at<=clock_timestamp()-interval '30 days'
 OR c.origem_updated_at+interval '2 hours'>clock_timestamp()
 OR EXISTS(SELECT 1 FROM public.mimo_nuvem_pedidos p WHERE p.empresa_id=_empresa AND p.loja_id=_loja AND p.token_hash=c.token_hash)
 OR EXISTS(SELECT 1 FROM public.mimo_recuperacao_supressoes s WHERE s.empresa_id=_empresa AND s.telefone=public.mimo_normalizar_telefone(c.telefone)) THEN RETURN; END IF;
 -- INSERT concorrente espera a identidade única; somente pendente pode ser apropriada.
 INSERT INTO public.mimo_recuperacao_fila(empresa_id,loja_id,checkout_id,token_hash,telefone,previsto_em)
 VALUES(_empresa,_loja,c.checkout_id,c.token_hash,public.mimo_normalizar_telefone(c.telefone),c.origem_updated_at+interval '2 hours')
 ON CONFLICT(empresa_id,loja_id,token_hash,canal,etapa) DO NOTHING;
 RETURN QUERY UPDATE public.mimo_recuperacao_fila SET estado='reservada',reserva=gen_random_uuid(),reservado_em=clock_timestamp(),
 solicitado_por=_ator,solicitado_em=clock_timestamp()
 WHERE empresa_id=_empresa AND loja_id=_loja AND token_hash=c.token_hash AND canal='whatsapp' AND etapa=1 AND estado='pendente'
 RETURNING *;
END $$;
