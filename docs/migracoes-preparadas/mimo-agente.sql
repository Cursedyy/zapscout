-- PREPARADA, NÃO APLICADA. Exige backup verificado e aplicação pelo migrador.
-- Sem conteúdo comercial real. Todos os envios começam desativados.
ALTER TABLE public.mimo_whatsapp_eventos ADD COLUMN referencia_anuncio jsonb;
CREATE TABLE public.mimo_agente_contatos (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),telefone text NOT NULL,primeiro_message_id text NOT NULL,
 primeira_direcao text NOT NULL,primeiro_contato_em timestamptz NOT NULL,PRIMARY KEY(empresa_id,telefone)
);
ALTER TABLE public.mimo_agente_contatos ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.mimo_agente_config (
 empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id), revisao integer NOT NULL DEFAULT 1,
 rascunho jsonb NOT NULL DEFAULT '{}', publicada integer, testada integer,
 modo text NOT NULL DEFAULT 'desativado' CHECK(modo IN ('desativado','piloto','ativo')),
 inicio_em timestamptz, vinculo_id uuid REFERENCES public.mimo_whatsapp_vinculos(id),
 atualizado_por uuid NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.mimo_agente_versoes (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), versao integer NOT NULL, config jsonb NOT NULL,
 ator_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(empresa_id,versao)
);
CREATE TABLE public.mimo_agente_conversas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 lead_id uuid REFERENCES public.mimo_leads(id), vinculo_id uuid NOT NULL REFERENCES public.mimo_whatsapp_vinculos(id),
 telefone text NOT NULL, piloto boolean NOT NULL, estado text NOT NULL DEFAULT 'agente' CHECK(estado IN ('agente','humano','pausada','bloqueada')),
 sequencia integer NOT NULL DEFAULT 0, ultimo_evento uuid,
 dados jsonb NOT NULL DEFAULT '{}', resumo text NOT NULL DEFAULT '', motivo text NOT NULL DEFAULT '',
 revisao_humana text NOT NULL DEFAULT 'pendente' CHECK(revisao_humana IN ('pendente','confirmada','rejeitada')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(empresa_id,lead_id), UNIQUE(empresa_id,telefone), CHECK(piloto OR lead_id IS NOT NULL)
);
CREATE TABLE public.mimo_agente_fila (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 conversa_id uuid NOT NULL REFERENCES public.mimo_agente_conversas(id), sequencia integer NOT NULL, versao integer NOT NULL,
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','reservada','enviando','enviada','cancelada','incerta','falha')),
 inicio_em timestamptz NOT NULL DEFAULT clock_timestamp(), executar_em timestamptz NOT NULL,
 reserva uuid, reservada_em timestamptz, resposta text, resultado jsonb, message_id text, solicitado_por uuid, solicitacao uuid,
 geracoes integer NOT NULL DEFAULT 0, latencia_ms integer, motivo text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conversa_id,sequencia), UNIQUE(empresa_id,solicitacao)
);
CREATE INDEX mimo_agente_fila_pendente ON public.mimo_agente_fila(executar_em) WHERE estado='pendente';
CREATE UNIQUE INDEX mimo_agente_envio_id ON public.mimo_agente_fila(empresa_id,message_id) WHERE message_id IS NOT NULL;
CREATE TABLE public.mimo_agente_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 conversa_id uuid REFERENCES public.mimo_agente_conversas(id), ator_id uuid, acao text NOT NULL,
 dados jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- Internal pilot never inserts a commercial lead or enters cohort/order indicators.
CREATE TABLE public.mimo_agente_piloto_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 conversa_id uuid NOT NULL REFERENCES public.mimo_agente_conversas(id), message_id text NOT NULL,
 direcao text NOT NULL CHECK(direcao IN ('recebida','enviada')), texto text NOT NULL,
 contato_em timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(conversa_id,message_id)
);
ALTER TABLE public.mimo_agente_piloto_eventos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mimo_agente_piloto_eventos TO authenticated;
CREATE POLICY agente_piloto_read ON public.mimo_agente_piloto_eventos FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('mimo-agente-materiais','mimo-agente-materiais',false,5242880,ARRAY['application/pdf','image/png','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY mimo_agente_storage_privado ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated USING(bucket_id<>'mimo-agente-materiais') WITH CHECK(bucket_id<>'mimo-agente-materiais');
CREATE TABLE public.mimo_agente_materiais (
 id uuid PRIMARY KEY,empresa_id uuid NOT NULL REFERENCES public.empresas(id),nome text NOT NULL CHECK(length(nome) BETWEEN 1 AND 120),
 tipo text NOT NULL CHECK(tipo IN ('catalogo','apresentacao')), path text NOT NULL UNIQUE, mime text NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),
 ativo boolean NOT NULL DEFAULT true,ator_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mimo_agente_materiais ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mimo_agente_materiais TO authenticated;
CREATE POLICY agente_material_read ON public.mimo_agente_materiais FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE FUNCTION public.mimo_agente_material(_empresa uuid,_ator uuid,_id uuid,_nome text DEFAULT NULL,_tipo text DEFAULT NULL,_path text DEFAULT NULL,_mime text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel IN ('administrador','gestor') FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa) THEN RAISE EXCEPTION 'Somente gestão'; END IF;
 IF _path IS NULL THEN
  UPDATE public.mimo_agente_materiais SET ativo=false WHERE empresa_id=_empresa AND id=_id;
 ELSE
  IF _path NOT LIKE _empresa::text||'/'||_id::text||'.%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='mimo-agente-materiais' AND name=_path) THEN RAISE EXCEPTION 'Arquivo privado inválido'; END IF;
  INSERT INTO public.mimo_agente_materiais(id,empresa_id,nome,tipo,path,mime,ator_id) VALUES(_id,_empresa,_nome,_tipo,_path,_mime,_ator);
 END IF;
 INSERT INTO public.mimo_agente_historico(empresa_id,ator_id,acao,dados) VALUES(_empresa,_ator,'material',jsonb_build_object('id',_id,'ativo',_path IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_material(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_material(uuid,uuid,uuid,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.mimo_agente_pode_ver(_empresa uuid,_lead uuid,_ator uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.tem_papel_empresa(_empresa,_ator,ARRAY['administrador','gestor']::public.empresa_papel[])
 OR (public.tem_papel_empresa(_empresa,_ator,ARRAY['vendedor']::public.empresa_papel[]) AND EXISTS(SELECT 1 FROM public.mimo_leads WHERE id=_lead AND empresa_id=_empresa AND responsavel_id=_ator))
$$;
ALTER TABLE public.mimo_agente_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_agente_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_agente_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_agente_fila ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mimo_agente_historico ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mimo_agente_config,public.mimo_agente_versoes,public.mimo_agente_conversas,public.mimo_agente_fila,public.mimo_agente_historico TO authenticated;
CREATE POLICY agente_config_read ON public.mimo_agente_config FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE POLICY agente_versoes_read ON public.mimo_agente_versoes FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));
CREATE POLICY agente_conversas_read ON public.mimo_agente_conversas FOR SELECT TO authenticated USING(public.mimo_agente_pode_ver(empresa_id,lead_id,auth.uid()));
CREATE POLICY agente_fila_read ON public.mimo_agente_fila FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.mimo_agente_conversas c WHERE c.id=conversa_id AND public.mimo_agente_pode_ver(c.empresa_id,c.lead_id,auth.uid())));
CREATE POLICY agente_historico_read ON public.mimo_agente_historico FOR SELECT TO authenticated USING(public.tem_papel_empresa(empresa_id,auth.uid(),ARRAY['administrador','gestor']::public.empresa_papel[]));

-- Called only on the atomic ingestion's final UPDATE, never on a duplicate webhook.
CREATE OR REPLACE FUNCTION public.mimo_agente_enfileirar(_conversa uuid,_evento uuid,_message_id text,_direcao text,_texto text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.mimo_agente_config; c public.mimo_agente_conversas; v jsonb; primeiro timestamptz; seq integer;
BEGIN
 SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id=(SELECT empresa_id FROM public.mimo_agente_conversas WHERE id=_conversa) FOR UPDATE;
 SELECT * INTO c FROM public.mimo_agente_conversas WHERE id=_conversa FOR UPDATE;
 IF c.id IS NULL THEN RETURN; END IF;
  IF _direcao='enviada' THEN
  IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND message_id=_message_id) THEN RETURN; END IF;
  -- Provider echo may arrive before HTTP acknowledgement. Reconcile its ID at completion.
  IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado='enviando') THEN RETURN; END IF;
  UPDATE public.mimo_agente_conversas SET estado=CASE WHEN estado='bloqueada' THEN estado ELSE 'humano' END,motivo='mensagem_manual',sequencia=sequencia+1,updated_at=clock_timestamp() WHERE id=c.id;
  UPDATE public.mimo_agente_fila SET estado='cancelada',motivo='mensagem_manual' WHERE conversa_id=c.id AND estado IN ('pendente','reservada');
  RETURN;
 END IF;

 SELECT config INTO v FROM public.mimo_agente_versoes WHERE empresa_id=cfg.empresa_id AND versao=cfg.publicada;
  UPDATE public.mimo_agente_conversas SET sequencia=sequencia+1,ultimo_evento=_evento,updated_at=clock_timestamp() WHERE id=c.id RETURNING sequencia INTO seq;
 SELECT min(inicio_em) INTO primeiro FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado IN ('pendente','reservada');
 UPDATE public.mimo_agente_fila SET estado='cancelada',motivo='nova_mensagem' WHERE conversa_id=c.id AND estado IN ('pendente','reservada');
 IF lower(_texto) ~ '(\m(pare|parar|stop|desisto)\M|descadastr|não quero mais|nao quero mais|não me envie|nao me envie)' THEN
  UPDATE public.mimo_agente_conversas SET estado='bloqueada',motivo='parar' WHERE id=c.id;
  RETURN;
 END IF;
 IF c.estado<>'agente' OR cfg.modo='desativado' OR v IS NULL THEN RETURN; END IF;
 -- An interrupted send is never replayed and cannot be followed by another automatic send.
 IF EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE conversa_id=c.id AND estado IN ('enviando','incerta')) THEN
  UPDATE public.mimo_agente_conversas SET estado='humano',motivo='envio_em_transito' WHERE id=c.id; RETURN;
 END IF;
 INSERT INTO public.mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,inicio_em,executar_em)
 VALUES(c.empresa_id,c.id,seq,cfg.publicada,coalesce(primeiro,clock_timestamp()),least(coalesce(primeiro,clock_timestamp())+make_interval(secs=>coalesce((v->>'agrupamentoSegundos')::int,20)),clock_timestamp()+make_interval(secs=>coalesce((v->>'silencioSegundos')::int,5))));
 RETURN;
END $$;
CREATE OR REPLACE FUNCTION public.mimo_agente_receber() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.mimo_agente_config; c public.mimo_agente_conversas; l public.mimo_leads; v jsonb; primeiro timestamptz; seq integer;
BEGIN
 IF NEW.lead_id IS NULL OR OLD.lead_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id=NEW.empresa_id FOR UPDATE;
 IF cfg.empresa_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.mimo_agente_conversas WHERE empresa_id=NEW.empresa_id AND lead_id=NEW.lead_id FOR UPDATE;
 SELECT config INTO v FROM public.mimo_agente_versoes WHERE empresa_id=cfg.empresa_id AND versao=cfg.publicada;
 IF c.id IS NULL THEN
  IF NEW.direcao='enviada' THEN RETURN NEW; END IF;
  SELECT * INTO l FROM public.mimo_leads WHERE id=NEW.lead_id AND empresa_id=NEW.empresa_id FOR UPDATE;
  IF cfg.modo='desativado' OR cfg.vinculo_id<>NEW.vinculo_id OR v IS NULL OR cfg.inicio_em IS NULL
   OR NEW.contato_em<cfg.inicio_em OR NEW.contato_em<clock_timestamp()-interval '5 minutes'
   OR l.created_at<NEW.created_at OR l.entrada_em<cfg.inicio_em OR l.etapa<>'novo' OR l.qualificacao<>'pendente'
   OR EXISTS(SELECT 1 FROM public.mimo_whatsapp_eventos WHERE empresa_id=NEW.empresa_id AND lead_id=l.id AND id<>NEW.id)
   OR NOT EXISTS(SELECT 1 FROM public.mimo_agente_contatos WHERE empresa_id=NEW.empresa_id AND telefone=l.telefone_normalizado AND primeiro_message_id=NEW.message_id AND primeira_direcao='recebida')
   OR (cfg.modo='piloto' AND NOT coalesce(v->'pilotos','[]') ? l.telefone_normalizado) THEN RETURN NEW; END IF;
  INSERT INTO public.mimo_agente_conversas(empresa_id,lead_id,vinculo_id,telefone,piloto) VALUES(NEW.empresa_id,l.id,NEW.vinculo_id,l.telefone_normalizado,cfg.modo='piloto') RETURNING * INTO c;
 END IF;
 PERFORM public.mimo_agente_enfileirar(c.id,NEW.id,NEW.message_id,NEW.direcao,NEW.texto);
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_agente_receber AFTER UPDATE OF lead_id ON public.mimo_whatsapp_eventos FOR EACH ROW EXECUTE FUNCTION public.mimo_agente_receber();

CREATE OR REPLACE FUNCTION public.mimo_agente_receber_piloto(_vinculo uuid,_owner uuid,_hash text,_message_id text,_telefone text,_texto text,_contato_em timestamptz,_from_me boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.mimo_agente_config; v public.mimo_whatsapp_vinculos; c public.mimo_agente_conversas; conf jsonb; n text; evento uuid;
BEGIN
 SELECT * INTO v FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo AND owner_id=_owner AND token_sha256=_hash AND ativo FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Vínculo inválido'; END IF;
 SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id=v.empresa_id FOR UPDATE;
 IF cfg.empresa_id IS NULL THEN RETURN false; END IF;
 SELECT config INTO conf FROM public.mimo_agente_versoes WHERE empresa_id=cfg.empresa_id AND versao=cfg.publicada;
 n:=public.mimo_normalizar_telefone(_telefone);
 SELECT * INTO c FROM public.mimo_agente_conversas WHERE empresa_id=v.empresa_id AND telefone=n AND piloto FOR UPDATE;
 IF c.id IS NULL AND NOT coalesce(conf->'pilotos' ? n,false) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=v.empresa_id AND slug='mimo' AND ativa) OR NOT public.tem_papel_empresa(v.empresa_id,v.confirmado_por,ARRAY['administrador']::public.empresa_papel[]) THEN RAISE EXCEPTION 'Vínculo não autorizado'; END IF;
 IF n IS NULL OR n=public.mimo_normalizar_telefone(v.numero_comercial) OR length(_message_id) NOT BETWEEN 1 AND 200 OR length(_texto)>10000 OR _contato_em IS NULL OR _contato_em>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'Evento inválido'; END IF;
 -- Known internal numbers stay outside the CRM even while paused or in production.
 IF c.id IS NULL THEN
  IF cfg.modo<>'piloto' OR cfg.vinculo_id<>v.id OR _from_me OR _contato_em<cfg.inicio_em OR _contato_em<clock_timestamp()-interval '5 minutes' THEN RETURN true; END IF;
  IF EXISTS(SELECT 1 FROM public.mimo_leads WHERE empresa_id=v.empresa_id AND telefone_normalizado=n) THEN RETURN true; END IF;
  INSERT INTO public.mimo_agente_conversas(empresa_id,lead_id,vinculo_id,telefone,piloto) VALUES(v.empresa_id,NULL,v.id,n,true) RETURNING * INTO c;
 END IF;
 INSERT INTO public.mimo_agente_piloto_eventos(empresa_id,conversa_id,message_id,direcao,texto,contato_em)
 VALUES(v.empresa_id,c.id,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_texto,_contato_em)
 ON CONFLICT(conversa_id,message_id) DO NOTHING RETURNING id INTO evento;
 IF evento IS NOT NULL THEN PERFORM public.mimo_agente_enfileirar(c.id,evento,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_texto); END IF;
 RETURN true;
END $$;
-- Keep existing, audited commercial ingestion intact. Pilot routing happens first.
ALTER FUNCTION public.mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean) RENAME TO mimo_receber_whatsapp_comercial;
CREATE FUNCTION public.mimo_receber_whatsapp(_vinculo uuid,_owner uuid,_token_sha256 text,_message_id text,_telefone text,_nome text,_texto text,_contato_em timestamptz,_from_me boolean,_referencia jsonb DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e uuid; l uuid; n text;
BEGIN
 -- Same lock order as configuration changes, before legacy ingestion locks the binding.
 PERFORM 1 FROM public.mimo_agente_config WHERE empresa_id=(SELECT empresa_id FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo) FOR UPDATE;
 IF public.mimo_agente_receber_piloto(_vinculo,_owner,_token_sha256,_message_id,_telefone,_texto,_contato_em,_from_me) THEN RETURN NULL; END IF;
 SELECT empresa_id INTO e FROM public.mimo_whatsapp_vinculos WHERE id=_vinculo; n:=public.mimo_normalizar_telefone(_telefone);
 IF n IS NOT NULL THEN
  INSERT INTO public.mimo_agente_contatos VALUES(e,n,_message_id,CASE WHEN _from_me THEN 'enviada' ELSE 'recebida' END,_contato_em) ON CONFLICT DO NOTHING;
 END IF;
 l:=public.mimo_receber_whatsapp_comercial(_vinculo,_owner,_token_sha256,_message_id,_telefone,_nome,_texto,_contato_em,_from_me);
 IF _referencia IS NOT NULL AND jsonb_typeof(_referencia)='object' AND length(_referencia::text)<2000 AND length(_referencia->>'id') BETWEEN 1 AND 200 AND _referencia->>'fonte'='metadado_whatsapp' AND _referencia->>'url' ~ '^https://([a-zA-Z0-9-]+\.)*(facebook\.com|instagram\.com|fb\.me)/' THEN
  UPDATE public.mimo_whatsapp_eventos SET referencia_anuncio=coalesce(referencia_anuncio,_referencia) WHERE vinculo_id=_vinculo AND message_id=_message_id;
 END IF;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION public.mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean,jsonb),public.mimo_agente_receber_piloto(uuid,uuid,text,text,text,text,timestamptz,boolean),public.mimo_agente_enfileirar(uuid,uuid,text,text,text),public.mimo_receber_whatsapp_comercial(uuid,uuid,text,text,text,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mimo_agente_operar(_empresa uuid,_ator uuid,_acao text,_p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.mimo_agente_config; c public.mimo_agente_conversas; gestor boolean; r jsonb; vers integer; v public.mimo_whatsapp_vinculos; f public.mimo_agente_fila;
BEGIN
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Empresa inválida'; END IF;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id=_ator AND ativo AND papel IN ('administrador','gestor','vendedor') FOR SHARE;
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

CREATE OR REPLACE FUNCTION public.mimo_agente_worker(_acao text,_p jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.mimo_agente_fila; c public.mimo_agente_conversas; cfg public.mimo_agente_config; v jsonb; msgs jsonb; permitido boolean; e uuid;
BEGIN
 IF _acao='reservar' THEN
  -- Lock config first in every path: serializes pause, ingestion and final send authorization.
  SELECT * INTO cfg FROM public.mimo_agente_config WHERE EXISTS(SELECT 1 FROM public.mimo_agente_fila WHERE empresa_id=mimo_agente_config.empresa_id AND ((estado IN ('reservada','enviando') AND reservada_em<clock_timestamp()-interval '3 minutes') OR (mimo_agente_config.modo<>'desativado' AND estado='pendente' AND solicitado_por IS NULL AND executar_em<=clock_timestamp()))) ORDER BY empresa_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF cfg.empresa_id IS NULL THEN RETURN NULL; END IF;
  -- Interrupted model runs go to a person; interrupted sends remain uncertain, never retried.
  UPDATE public.mimo_agente_conversas SET estado='humano',motivo='processamento_interrompido' WHERE estado<>'bloqueada' AND empresa_id=cfg.empresa_id AND id IN(SELECT conversa_id FROM public.mimo_agente_fila WHERE estado IN ('reservada','enviando') AND reservada_em<clock_timestamp()-interval '3 minutes');
  UPDATE public.mimo_agente_fila SET estado=CASE estado WHEN 'enviando' THEN 'incerta' ELSE 'falha' END,motivo='processamento_interrompido' WHERE empresa_id=cfg.empresa_id AND estado IN ('reservada','enviando') AND reservada_em<clock_timestamp()-interval '3 minutes';
  IF cfg.modo='desativado' THEN RETURN NULL; END IF;
  SELECT * INTO f FROM public.mimo_agente_fila WHERE empresa_id=cfg.empresa_id AND estado='pendente' AND solicitado_por IS NULL AND executar_em<=clock_timestamp() ORDER BY executar_em LIMIT 1 FOR UPDATE SKIP LOCKED;
 ELSE
  SELECT empresa_id INTO e FROM public.mimo_agente_fila WHERE id=(_p->>'id')::uuid;
  SELECT * INTO cfg FROM public.mimo_agente_config WHERE empresa_id=e FOR UPDATE;
  SELECT * INTO f FROM public.mimo_agente_fila WHERE id=(_p->>'id')::uuid AND reserva=(_p->>'reserva')::uuid FOR UPDATE;
 END IF;
 IF f.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.mimo_agente_conversas WHERE id=f.conversa_id FOR UPDATE;
 SELECT config INTO v FROM public.mimo_agente_versoes WHERE empresa_id=f.empresa_id AND versao=f.versao;
 PERFORM 1 FROM public.empresas WHERE id=f.empresa_id FOR SHARE;
 PERFORM 1 FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id FOR SHARE;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=f.empresa_id AND user_id IN (
  SELECT ator_id FROM public.mimo_agente_versoes WHERE empresa_id=f.empresa_id AND versao=f.versao
  UNION SELECT confirmado_por FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id) ORDER BY user_id FOR SHARE;
 PERFORM 1 FROM public.mimo_leads WHERE id=c.lead_id AND empresa_id=c.empresa_id FOR SHARE;
 permitido:=cfg.modo<>'desativado' AND cfg.publicada=f.versao AND cfg.vinculo_id=c.vinculo_id AND c.estado='agente' AND c.sequencia=f.sequencia
  AND EXISTS(SELECT 1 FROM public.empresas WHERE id=f.empresa_id AND ativa AND slug='mimo')
  AND EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE id=c.vinculo_id AND empresa_id=c.empresa_id AND ativo AND public.tem_papel_empresa(empresa_id,confirmado_por,ARRAY['administrador']::public.empresa_papel[]))
  AND (NOT c.piloto OR coalesce(v->'pilotos' ? c.telefone,false)) AND (cfg.modo<>'piloto' OR c.piloto)
  AND (c.piloto OR EXISTS(SELECT 1 FROM public.mimo_leads WHERE id=c.lead_id AND empresa_id=c.empresa_id AND etapa IN ('novo','contato_realizado') AND qualificacao='pendente'))
  AND EXISTS(SELECT 1 FROM public.mimo_agente_versoes av WHERE av.empresa_id=c.empresa_id AND av.versao=f.versao AND public.tem_papel_empresa(c.empresa_id,av.ator_id,ARRAY['administrador','gestor']::public.empresa_papel[]));
 IF _acao='reservar' THEN
  IF NOT coalesce(permitido,false) THEN UPDATE public.mimo_agente_fila SET estado='cancelada' WHERE id=f.id; RETURN NULL; END IF;
  IF (SELECT coalesce(sum(geracoes),0) FROM public.mimo_agente_fila WHERE conversa_id=c.id)>=coalesce((v->>'maxMensagens')::int,16)
   OR (SELECT coalesce(sum(geracoes),0) FROM public.mimo_agente_fila WHERE empresa_id=c.empresa_id AND inicio_em>=date_trunc('day',clock_timestamp()))>=coalesce((v->>'limiteDiario')::int,100) THEN
   UPDATE public.mimo_agente_conversas SET estado='humano',motivo='limite_de_uso' WHERE id=c.id;
   UPDATE public.mimo_agente_fila SET estado='falha',motivo='limite_de_uso' WHERE id=f.id; RETURN NULL;
  END IF;
  UPDATE public.mimo_agente_fila SET estado='reservada',reserva=gen_random_uuid(),reservada_em=clock_timestamp(),geracoes=1 WHERE id=f.id RETURNING * INTO f;
  SELECT coalesce(jsonb_agg(jsonb_build_object('role',CASE WHEN direcao='recebida' THEN 'user' ELSE 'assistant' END,'content',texto) ORDER BY created_at,id),'[]') INTO msgs FROM (SELECT id,direcao,texto,created_at FROM (
 SELECT id,direcao,texto,created_at FROM public.mimo_whatsapp_eventos WHERE empresa_id=c.empresa_id AND lead_id=c.lead_id AND NOT c.piloto
 UNION ALL SELECT id,direcao,texto,created_at FROM public.mimo_agente_piloto_eventos WHERE empresa_id=c.empresa_id AND conversa_id=c.id AND c.piloto
 ) m ORDER BY created_at DESC,id DESC LIMIT 40)t;
  RETURN jsonb_build_object('id',f.id,'reserva',f.reserva,'empresa',c.empresa_id,'conversa',c.id,'telefone',c.telefone,'vinculo',c.vinculo_id,'config',v,'dados',c.dados,'mensagens',msgs,
   'materiais',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.mimo_agente_materiais m WHERE m.empresa_id=c.empresa_id AND m.ativo AND v->'materiais' ? m.id::text),'[]'));
 ELSIF _acao='validar' THEN
  RETURN to_jsonb(coalesce(permitido,false) AND f.estado='reservada' AND f.reservada_em>clock_timestamp()-interval '3 minutes');
 ELSIF _acao='autorizar' THEN
  IF NOT coalesce(permitido,false) OR f.estado<>'reservada' OR f.reservada_em<clock_timestamp()-interval '3 minutes' THEN RETURN 'false'; END IF;
  IF _p->'resultado'->>'materialId' IS NOT NULL THEN
   PERFORM 1 FROM public.mimo_agente_materiais WHERE id=(_p->'resultado'->>'materialId')::uuid AND empresa_id=c.empresa_id AND ativo AND v->'materiais' ? id::text FOR SHARE;
   IF NOT FOUND THEN RETURN 'false'; END IF;
  END IF;
  IF coalesce(length(_p->'resultado'->>'resposta'),0) NOT BETWEEN 1 AND 800 OR coalesce(_p->'resultado'->>'estado','') NOT IN ('agente','humano','bloqueada') THEN RAISE EXCEPTION 'Resposta inválida'; END IF;
  UPDATE public.mimo_agente_fila SET estado='enviando',resposta=_p->'resultado'->>'resposta',resultado=_p->'resultado',updated_at=clock_timestamp() WHERE id=f.id;
  RETURN 'true';
 ELSIF _acao IN ('enviada','incerta','falha','cancelar') THEN
  IF _acao='enviada' AND nullif(_p->>'messageId','') IS NULL THEN RAISE EXCEPTION 'Aceite sem identificação'; END IF;
  IF (_acao IN ('enviada','incerta') AND f.estado<>'enviando') OR (_acao IN ('falha','cancelar') AND f.estado<>'reservada') THEN RETURN 'false'; END IF;
  UPDATE public.mimo_agente_fila SET estado=CASE WHEN _acao='cancelar' THEN 'cancelada' ELSE _acao END,message_id=nullif(_p->>'messageId',''),motivo=coalesce(_p->>'motivo',''),latencia_ms=greatest(0,(extract(epoch FROM clock_timestamp()-f.inicio_em)*1000)::int),updated_at=clock_timestamp() WHERE id=f.id;
  IF _acao='enviada' THEN
   -- Preserve the exact issued bytes in company conversation history.
   IF c.piloto THEN
    INSERT INTO public.mimo_agente_piloto_eventos(empresa_id,conversa_id,message_id,direcao,texto,contato_em)
    VALUES(c.empresa_id,c.id,_p->>'messageId','enviada',f.resposta,clock_timestamp()) ON CONFLICT(conversa_id,message_id) DO NOTHING;
   ELSE
   INSERT INTO public.mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em)
   VALUES(c.empresa_id,c.vinculo_id,_p->>'messageId',c.lead_id,'enviada',f.resposta,clock_timestamp()) ON CONFLICT(vinculo_id,message_id) DO NOTHING;
   END IF;
   UPDATE public.mimo_agente_conversas SET dados=coalesce(f.resultado->'dados',dados),resumo=coalesce(f.resultado->>'resumo',resumo),
    estado=CASE WHEN sequencia=f.sequencia AND estado='agente' THEN coalesce(f.resultado->>'estado','humano') ELSE estado END,
    motivo=CASE WHEN sequencia=f.sequencia THEN coalesce(f.resultado->>'motivo','') ELSE motivo END,updated_at=clock_timestamp() WHERE id=c.id;
   IF EXISTS(SELECT 1 FROM public.mimo_whatsapp_eventos WHERE lead_id=c.lead_id AND empresa_id=c.empresa_id AND direcao='enviada' AND created_at>=f.reservada_em AND message_id<>_p->>'messageId') OR EXISTS(SELECT 1 FROM public.mimo_agente_piloto_eventos WHERE conversa_id=c.id AND empresa_id=c.empresa_id AND direcao='enviada' AND created_at>=f.reservada_em AND message_id<>_p->>'messageId') THEN
    UPDATE public.mimo_agente_conversas SET estado=CASE WHEN estado='bloqueada' THEN estado ELSE 'humano' END,motivo='mensagem_manual' WHERE id=c.id;
   END IF;
  ELSIF _acao IN ('incerta','falha') THEN
   UPDATE public.mimo_agente_conversas SET estado='humano',motivo=CASE _acao WHEN 'incerta' THEN 'aceite_incerto' ELSE 'falha_processamento' END WHERE id=c.id AND estado<>'bloqueada';
  END IF;
  INSERT INTO public.mimo_agente_historico(empresa_id,conversa_id,acao,dados) VALUES(c.empresa_id,c.id,_acao,jsonb_build_object('fila',f.id));
  RETURN 'true';
 END IF;
 RAISE EXCEPTION 'Ação inválida';
END $$;
REVOKE ALL ON FUNCTION public.mimo_agente_pode_ver(uuid,uuid,uuid),public.mimo_agente_receber(),public.mimo_agente_operar(uuid,uuid,text,jsonb),public.mimo_agente_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
-- Do not rely on project-wide Supabase default table privileges.
REVOKE ALL ON public.mimo_agente_config,public.mimo_agente_versoes,public.mimo_agente_conversas,public.mimo_agente_fila,public.mimo_agente_historico,public.mimo_agente_contatos,public.mimo_agente_piloto_eventos,public.mimo_agente_materiais FROM anon,authenticated,service_role;
GRANT SELECT ON public.mimo_agente_config,public.mimo_agente_versoes,public.mimo_agente_conversas,public.mimo_agente_fila,public.mimo_agente_historico,public.mimo_agente_piloto_eventos,public.mimo_agente_materiais TO authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_pode_ver(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_agente_operar(uuid,uuid,text,jsonb),public.mimo_agente_worker(text,jsonb) TO service_role;
