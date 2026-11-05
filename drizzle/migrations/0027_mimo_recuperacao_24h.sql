-- Mudança autorizada pela equipe: envios WhatsApp 24h, mantendo as demais proteções.
CREATE OR REPLACE FUNCTION public.mimo_recuperacao_reservar(_empresa uuid) RETURNS SETOF public.mimo_recuperacao_fila
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cfg public.mimo_recuperacao_config; trabalho uuid;
BEGIN
 SELECT * INTO cfg FROM public.mimo_recuperacao_config WHERE empresa_id=_empresa AND ativo;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,cfg.ator_id);
 IF NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=cfg.vinculo_id AND empresa_id=_empresa AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[])) THEN RETURN; END IF;
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
CREATE OR REPLACE FUNCTION public.mimo_recuperacao_autorizar(_id uuid,_reserva uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.mimo_recuperacao_fila; cfg public.mimo_recuperacao_config;
BEGIN
 SELECT * INTO f FROM public.mimo_recuperacao_fila WHERE id=_id AND reserva=_reserva AND estado='reservada' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO cfg FROM public.mimo_recuperacao_config WHERE empresa_id=f.empresa_id AND ativo FOR SHARE;
 IF FOUND THEN PERFORM public.mimo_nuvem_oauth_acesso(cfg.empresa_id,cfg.ator_id); END IF;
 IF cfg.empresa_id IS NULL OR cfg.loja_id<>f.loja_id
 OR f.reservado_em<clock_timestamp()-interval '1 minute'
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
