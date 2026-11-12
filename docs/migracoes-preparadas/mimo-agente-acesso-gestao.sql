-- Restrict direct reads and service-mediated operations to management.
CREATE OR REPLACE FUNCTION public.mimo_agente_pode_ver(_empresa uuid,_lead uuid,_ator uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.tem_papel_empresa(_empresa,_ator,ARRAY['administrador','gestor']::public.empresa_papel[])
$$;
CREATE OR REPLACE FUNCTION public.mimo_agente_operar(_empresa uuid,_ator uuid,_acao text,_p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.mimo_agente_config; c public.mimo_agente_conversas; gestor boolean; r jsonb; vers integer; v public.mimo_whatsapp_vinculos; f public.mimo_agente_fila;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Empresa inválida'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 gestor:=public.tem_papel_empresa(_empresa,_ator,ARRAY['administrador','gestor']::public.empresa_papel[]);
 IF gestor THEN INSERT INTO public.mimo_agente_config(empresa_id,atualizado_por) VALUES(_empresa,_ator) ON CONFLICT DO NOTHING; END IF;
 SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id=_empresa FOR UPDATE;
 IF _acao='painel' THEN
  SELECT jsonb_build_object('gestor',gestor,'config',CASE WHEN gestor THEN to_jsonb(cfg) ELSE NULL END,
   'vinculos',CASE WHEN gestor THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'numero_comercial',numero_comercial,'ativo',ativo)) FROM public.mimo_whatsapp_vinculos WHERE empresa_id=_empresa AND ativo),'[]') ELSE '[]'::jsonb END,
   'materiais',CASE WHEN gestor THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'tipo',tipo,'ativo',ativo)) FROM public.mimo_agente_materiais WHERE empresa_id=_empresa),'[]') ELSE '[]'::jsonb END,
   'indicadores',(SELECT jsonb_build_object('filaHumana',count(*) FILTER(WHERE cc.estado='humano'),'incompletas',count(*) FILTER(WHERE cc.resumo LIKE 'Coleta incompleta%'),'confirmadas',count(*) FILTER(WHERE cc.revisao_humana='confirmada'),'rejeitadas',count(*) FILTER(WHERE cc.revisao_humana='rejeitada'),'pedidosHumano',count(*) FILTER(WHERE cc.motivo IN ('atendimento_humano','promessa_encaminhamento')))
    FROM public.mimo_agente_conversas cc WHERE cc.empresa_id=_empresa AND NOT cc.piloto AND public.mimo_agente_pode_ver(_empresa,cc.lead_id,_ator)),
   'consumo',(SELECT jsonb_build_object('geracoes',coalesce(sum(ff.geracoes) FILTER(WHERE NOT cc.piloto),0),'geracoesPiloto',coalesce(sum(ff.geracoes) FILTER(WHERE cc.piloto),0),'falhas',count(*) FILTER(WHERE ff.estado='falha'),'incertas',count(*) FILTER(WHERE ff.estado='incerta'),'primeiraRespostaMs',(SELECT round(avg(primeira.ms)) FROM (SELECT DISTINCT ON(cx.id) fx.latencia_ms ms FROM public.mimo_agente_fila fx JOIN public.mimo_agente_conversas cx ON cx.id=fx.conversa_id WHERE cx.empresa_id=_empresa AND NOT cx.piloto AND fx.estado='enviada' AND fx.solicitado_por IS NULL AND public.mimo_agente_pode_ver(_empresa,cx.lead_id,_ator) ORDER BY cx.id,fx.inicio_em,fx.id) primeira))
    FROM public.mimo_agente_fila ff JOIN public.mimo_agente_conversas cc ON cc.id=ff.conversa_id WHERE cc.empresa_id=_empresa AND public.mimo_agente_pode_ver(_empresa,cc.lead_id,_ator)),
   'versoes',CASE WHEN gestor THEN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY versao DESC) FROM public.mimo_agente_versoes t WHERE empresa_id=_empresa),'[]') ELSE '[]'::jsonb END,
   'historico',CASE WHEN gestor THEN coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM public.mimo_agente_historico WHERE empresa_id=_empresa ORDER BY created_at DESC LIMIT 50)t),'[]') ELSE '[]'::jsonb END,
   'conversas',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT conv.*,coalesce(l.nome_empresa,'Piloto interno') AS nome_empresa,l.responsavel_id,
     (SELECT coalesce(jsonb_agg(to_jsonb(hh) ORDER BY hh.contato_em),'[]') FROM (
       SELECT direcao,texto,contato_em,referencia_anuncio FROM public.mimo_whatsapp_eventos WHERE empresa_id=conv.empresa_id AND lead_id=conv.lead_id AND NOT conv.piloto
       UNION ALL SELECT direcao,texto,contato_em,NULL::jsonb FROM public.mimo_agente_piloto_eventos WHERE empresa_id=conv.empresa_id AND conversa_id=conv.id AND conv.piloto
       ORDER BY contato_em DESC LIMIT 40) hh) mensagens,
     (SELECT coalesce(jsonb_agg(to_jsonb(histfila)),'[]') FROM (SELECT id,estado,motivo,geracoes,latencia_ms,message_id,updated_at FROM public.mimo_agente_fila WHERE conversa_id=conv.id ORDER BY inicio_em DESC LIMIT 10) histfila) fila
     FROM public.mimo_agente_conversas conv LEFT JOIN public.mimo_leads l ON l.id=conv.lead_id AND l.empresa_id=conv.empresa_id
     WHERE conv.empresa_id=_empresa AND public.mimo_agente_pode_ver(_empresa,conv.lead_id,_ator) ORDER BY conv.updated_at DESC LIMIT 100)t),'[]')) INTO r;
  RETURN r;
 END IF;
 IF _acao IN ('salvar','publicar','ativar','pausar_geral','simulacao','simulacao_reservar') THEN
  IF NOT gestor THEN RAISE EXCEPTION 'Somente gestão'; END IF;
  IF _acao<>'pausar_geral' AND cfg.revisao IS DISTINCT FROM (_p->>'revisao')::int THEN RAISE EXCEPTION 'Configuração alterada; recarregue'; END IF;
  IF _acao='salvar' THEN
   IF jsonb_typeof(_p->'config')<>'object' OR length((_p->'config')::text)>50000 THEN RAISE EXCEPTION 'Configuração inválida'; END IF;
   UPDATE public.mimo_agente_config SET rascunho=_p->'config',revisao=revisao+1,testada=NULL,atualizado_por=_ator,atualizado_em=clock_timestamp() WHERE empresa_id=_empresa;
  ELSIF _acao='simulacao' THEN
   UPDATE public.mimo_agente_config SET testada=revisao WHERE empresa_id=_empresa;
  ELSIF _acao='simulacao_reservar' THEN
   IF (SELECT count(*) FROM public.mimo_agente_historico WHERE empresa_id=_empresa AND acao='simulacao_reservar' AND created_at>clock_timestamp()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Limite de simulações atingido; tente mais tarde'; END IF;
  ELSIF _acao='publicar' THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(cfg.rascunho->'materiais','[]')) x(id) WHERE NOT EXISTS(SELECT 1 FROM public.mimo_agente_materiais mm WHERE mm.empresa_id=_empresa AND mm.ativo AND mm.id::text=x.id)) THEN RAISE EXCEPTION 'Confira os materiais aprovados'; END IF;
   IF cfg.testada IS DISTINCT FROM cfg.revisao OR coalesce(cfg.rascunho->>'conhecimento','')='' OR NOT coalesce((cfg.rascunho->>'conhecimentoRevisado')::boolean,false) OR NOT coalesce((cfg.rascunho->>'encaminhamentoRevisado')::boolean,false) OR coalesce(jsonb_array_length(cfg.rascunho->'horarios'),0)=0 THEN RAISE EXCEPTION 'Revise conhecimento, horários, encaminhamento e simulador'; END IF;
   SELECT coalesce(max(versao),0)+1 INTO vers FROM public.mimo_agente_versoes WHERE empresa_id=_empresa;
   INSERT INTO public.mimo_agente_versoes VALUES(_empresa,vers,cfg.rascunho,_ator,clock_timestamp());
   UPDATE public.mimo_agente_config SET publicada=vers,modo='desativado' WHERE empresa_id=_empresa;
  ELSIF _acao='ativar' THEN
   IF cfg.publicada IS DISTINCT FROM (_p->>'publicada')::int THEN RAISE EXCEPTION 'Versão publicada mudou; recarregue'; END IF;
   IF cfg.publicada IS NULL OR coalesce(_p->>'modo','') NOT IN ('piloto','ativo') THEN RAISE EXCEPTION 'Publique antes de ativar'; END IF;
   IF _p->>'modo'='ativo' AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_fila pf JOIN public.mimo_agente_conversas pc ON pc.id=pf.conversa_id WHERE pc.empresa_id=_empresa AND pc.piloto AND pf.versao=cfg.publicada AND pf.estado='enviada') THEN RAISE EXCEPTION 'Valide um envio interno desta versão antes de ativar'; END IF;
   IF _p->>'modo'='piloto' AND NOT EXISTS(SELECT 1 FROM public.mimo_agente_versoes WHERE empresa_id=_empresa AND versao=cfg.publicada AND jsonb_array_length(config->'pilotos')>0) THEN RAISE EXCEPTION 'Cadastre números internos autorizados'; END IF;
   SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE empresa_id=_empresa AND ativo AND id=(_p->>'vinculo')::uuid FOR SHARE;
   IF v.id IS NULL OR NOT public.tem_papel_empresa(_empresa,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Confirme o número comercial'; END IF;
   UPDATE public.mimo_agente_config SET modo=_p->>'modo',vinculo_id=v.id,inicio_em=coalesce(inicio_em,clock_timestamp()) WHERE empresa_id=_empresa;
  ELSE
   UPDATE public.mimo_agente_config SET modo='desativado' WHERE empresa_id=_empresa;
  END IF;
  IF _acao IN ('publicar','pausar_geral') THEN
   UPDATE public.mimo_agente_conversas SET estado='pausada',sequencia=sequencia+1,motivo=_acao WHERE empresa_id=_empresa AND estado='agente';
   UPDATE public.mimo_agente_fila SET estado='cancelada',motivo=_acao WHERE empresa_id=_empresa AND estado IN ('pendente','reservada');
  END IF;
 ELSE
  SELECT * INTO c FROM public.mimo_agente_conversas WHERE id=(_p->>'conversa')::uuid AND empresa_id=_empresa FOR UPDATE;
  PERFORM 1 FROM public.mimo_leads WHERE id=c.lead_id AND empresa_id=_empresa FOR SHARE;
  IF c.id IS NULL OR NOT public.mimo_agente_pode_ver(_empresa,c.lead_id,_ator) THEN RAISE EXCEPTION 'Conversa não autorizada'; END IF;
  IF _acao='responder_reservar' THEN
   IF length(btrim(_p->>'texto')) NOT BETWEEN 1 AND 2000 OR _p->>'solicitacao' IS NULL THEN RAISE EXCEPTION 'Mensagem inválida'; END IF;
   IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE empresa_id=_empresa AND solicitacao=(_p->>'solicitacao')::uuid) THEN RETURN jsonb_build_object('duplicada',true); END IF;
   IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado IN ('enviando','incerta')) THEN RAISE EXCEPTION 'Envio pendente de confirmação'; END IF;
   UPDATE public.mimo_agente_conversas SET estado=CASE WHEN estado='bloqueada' THEN estado ELSE 'humano' END,sequencia=sequencia+1,motivo='resposta_manual' WHERE id=c.id;
   UPDATE public.mimo_agente_fila SET estado='cancelada',motivo='resposta_manual' WHERE conversa_id=c.id AND estado IN ('pendente','reservada');
   INSERT INTO public.mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,executar_em,estado,reserva,reservada_em,resposta,solicitado_por,solicitacao)
   VALUES(_empresa,c.id,c.sequencia+1,cfg.publicada,clock_timestamp(),'reservada',gen_random_uuid(),clock_timestamp(),btrim(_p->>'texto'),_ator,(_p->>'solicitacao')::uuid) RETURNING * INTO f;
   INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,ator_id,acao) VALUES(_empresa,c.id,_ator,'resposta_manual');
   RETURN jsonb_build_object('id',f.id,'reserva',f.reserva,'empresa',c.empresa_id,'conversa',c.id,'telefone',c.telefone,'vinculo',c.vinculo_id);
  ELSIF _acao='responder_autorizar' THEN
   SELECT * INTO f FROM public.mimo_agente_fila WHERE id=(_p->>'id')::uuid AND conversa_id=c.id AND reserva=(_p->>'reserva')::uuid AND solicitado_por=_ator FOR UPDATE;
   IF f.id IS NULL OR f.estado<>'reservada' OR f.sequencia<>c.sequencia OR f.reservada_em<clock_timestamp()-interval '3 minutes' OR NOT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id AND empresa_id=_empresa AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[])) THEN RETURN 'false'; END IF;
   UPDATE public.mimo_agente_fila SET estado='enviando' WHERE id=f.id;
   RETURN 'true';
  ELSIF _acao='revisar' THEN
   IF _p->>'revisaoHumana' NOT IN ('confirmada','rejeitada') THEN RAISE EXCEPTION 'Revisão inválida'; END IF;
   UPDATE public.mimo_agente_conversas SET revisao_humana=_p->>'revisaoHumana' WHERE id=c.id;
  ELSIF _acao IN ('assumir','pausar','devolver') THEN
   IF c.estado='bloqueada' AND _acao IN ('devolver','assumir','pausar') THEN RAISE EXCEPTION 'Contato pediu para parar'; END IF;
   IF _acao='devolver' AND (cfg.modo='desativado' OR EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado IN ('incerta','enviando'))) THEN RAISE EXCEPTION 'Agente indisponível ou envio incerto'; END IF;
   UPDATE public.mimo_agente_conversas SET estado=CASE _acao WHEN 'assumir' THEN 'humano' WHEN 'pausar' THEN 'pausada' ELSE 'agente' END,sequencia=sequencia+1,motivo=_acao,updated_at=clock_timestamp() WHERE id=c.id;
   UPDATE public.mimo_agente_fila SET estado='cancelada',motivo=_acao WHERE conversa_id=c.id AND estado IN ('pendente','reservada');
  ELSE RAISE EXCEPTION 'Ação inválida'; END IF;
 END IF;
 INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,ator_id,acao,dados) VALUES(_empresa,c.id,_ator,_acao,_p-'config'-'mensagens');
 RETURN jsonb_build_object('ok',true);
END $$;

NOTIFY pgrst,'reload schema';
