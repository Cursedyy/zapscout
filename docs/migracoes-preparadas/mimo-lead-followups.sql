-- PREPARED ONLY. No existing policies, bindings, order totals or legacy leads are changed.
CREATE FUNCTION public.mimo_follow_pode_lead(_empresa uuid, _lead uuid, _ator uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.empresas e JOIN public.empresa_membros m ON m.empresa_id=e.id
 JOIN public.mimo_leads l ON l.empresa_id=e.id
 WHERE e.id=_empresa AND e.slug='mimo' AND e.ativa AND m.user_id=_ator AND m.ativo
 AND l.id=_lead AND m.papel IN ('administrador','gestor','vendedor'))
 AND public.pode_ver_mimo_lead(_lead,_ator)
$$;
REVOKE ALL ON FUNCTION public.mimo_follow_pode_lead(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_follow_pode_lead(uuid,uuid,uuid) TO authenticated,service_role;

CREATE TABLE public.mimo_lead_followups (
 id uuid PRIMARY KEY, empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 lead_id uuid NOT NULL REFERENCES public.mimo_leads(id), responsavel_id uuid NOT NULL,
 prazo timestamptz NOT NULL, observacao text NOT NULL,
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','concluido','cancelado')),
 versao integer NOT NULL DEFAULT 1 CHECK(versao>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mimo_lead_followups TO authenticated;
GRANT ALL ON public.mimo_lead_followups TO service_role;
ALTER TABLE public.mimo_lead_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_follow_read ON public.mimo_lead_followups FOR SELECT TO authenticated
 USING(public.mimo_follow_pode_lead(empresa_id,lead_id,auth.uid()));
CREATE INDEX mimo_follow_pendentes ON public.mimo_lead_followups(empresa_id,prazo,id) WHERE estado='pendente';
CREATE INDEX mimo_follow_lead ON public.mimo_lead_followups(empresa_id,lead_id,prazo,id);

CREATE TABLE public.mimo_lead_followup_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 follow_id uuid NOT NULL REFERENCES public.mimo_lead_followups(id), lead_id uuid NOT NULL REFERENCES public.mimo_leads(id),
 ator_id uuid NOT NULL, acao text NOT NULL, operacao_id uuid NOT NULL,
 requisicao jsonb NOT NULL, anterior jsonb, atual jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,operacao_id)
);
GRANT SELECT ON public.mimo_lead_followup_historico TO authenticated;
GRANT ALL ON public.mimo_lead_followup_historico TO service_role;
ALTER TABLE public.mimo_lead_followup_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY mimo_follow_history_read ON public.mimo_lead_followup_historico FOR SELECT TO authenticated
 USING(public.mimo_follow_pode_lead(empresa_id,lead_id,auth.uid()));
CREATE INDEX mimo_follow_history_lead ON public.mimo_lead_followup_historico(empresa_id,lead_id,created_at,id);

CREATE FUNCTION public.mimo_follow_validar() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT isfinite(NEW.prazo) OR length(btrim(NEW.observacao)) NOT BETWEEN 1 AND 500
 OR NOT public.mimo_follow_pode_lead(NEW.empresa_id,NEW.lead_id,NEW.responsavel_id)
 THEN RAISE EXCEPTION 'Follow-up inválido' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mimo_follow_validar BEFORE INSERT OR UPDATE ON public.mimo_lead_followups FOR EACH ROW EXECUTE FUNCTION public.mimo_follow_validar();
CREATE FUNCTION public.mimo_follow_history_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Histórico imutável'; END $$;
CREATE TRIGGER mimo_follow_history_imutavel BEFORE UPDATE OR DELETE ON public.mimo_lead_followup_historico FOR EACH ROW EXECUTE FUNCTION public.mimo_follow_history_imutavel();

CREATE FUNCTION public.mimo_lead_followup_operar(_empresa uuid,_dados jsonb)
RETURNS public.mimo_lead_followups LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ator uuid:=auth.uid(); lid uuid:=(_dados->>'lead_id')::uuid; fid uuid:=(_dados->>'id')::uuid;
 op uuid:=(_dados->>'operacao_id')::uuid; resp uuid:=(_dados->>'responsavel_id')::uuid;
 prazo_n timestamptz:=(_dados->>'prazo')::timestamptz; obs text:=btrim(_dados->>'observacao');
 acao_n text:=_dados->>'acao'; version_n integer:=(_dados->>'versao')::integer;
 old public.mimo_lead_followups; result public.mimo_lead_followups; hist public.mimo_lead_followup_historico;
BEGIN
 -- Stable lock order prevents membership changes/reassignment racing authorization.
 PERFORM 1 FROM public.empresas WHERE id=_empresa AND slug='mimo' AND ativa FOR SHARE;
 PERFORM 1 FROM public.empresa_membros WHERE empresa_id=_empresa AND user_id IN (ator,resp) ORDER BY user_id FOR SHARE;
 PERFORM 1 FROM public.mimo_leads WHERE empresa_id=_empresa AND id=lid FOR UPDATE;
 IF NOT public.mimo_follow_pode_lead(_empresa,lid,ator) OR NOT public.mimo_follow_pode_lead(_empresa,lid,resp)
 THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF fid IS NULL OR op IS NULL OR resp IS NULL OR version_n IS NULL OR version_n<0 OR prazo_n IS NULL
 OR NOT isfinite(prazo_n) OR obs IS NULL OR length(obs) NOT BETWEEN 1 AND 500
 OR acao_n IS NULL OR acao_n NOT IN ('agendar','reagendar','concluir','cancelar')
 THEN RAISE EXCEPTION 'Campos inválidos' USING ERRCODE='22023'; END IF;
 -- Same operation/payload may be retried safely after an interrupted response.
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text||op::text,0));
 SELECT * INTO hist FROM public.mimo_lead_followup_historico WHERE empresa_id=_empresa AND operacao_id=op;
 IF hist.id IS NOT NULL THEN
  IF hist.ator_id<>ator OR hist.requisicao<>_dados THEN RAISE EXCEPTION 'Operação reutilizada' USING ERRCODE='22023'; END IF;
  SELECT * INTO result FROM public.mimo_lead_followups WHERE id=hist.follow_id AND empresa_id=_empresa;
  RETURN result;
 END IF;
 SELECT * INTO old FROM public.mimo_lead_followups WHERE id=fid FOR UPDATE;
 IF acao_n='agendar' THEN
  IF old.id IS NOT NULL OR version_n<>0 THEN RAISE EXCEPTION 'Versão alterada' USING ERRCODE='40001'; END IF;
  INSERT INTO public.mimo_lead_followups(id,empresa_id,lead_id,responsavel_id,prazo,observacao)
  VALUES(fid,_empresa,lid,resp,prazo_n,obs) RETURNING * INTO result;
 ELSE
  IF old.id IS NULL OR old.empresa_id<>_empresa OR old.lead_id<>lid THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  IF old.versao<>version_n THEN RAISE EXCEPTION 'Versão alterada' USING ERRCODE='40001'; END IF;
  IF old.estado<>'pendente' THEN RAISE EXCEPTION 'Follow-up encerrado' USING ERRCODE='22023'; END IF;
  UPDATE public.mimo_lead_followups SET prazo=CASE WHEN acao_n='reagendar' THEN prazo_n ELSE old.prazo END,
   responsavel_id=CASE WHEN acao_n='reagendar' THEN resp ELSE old.responsavel_id END,
   observacao=obs, estado=CASE acao_n WHEN 'concluir' THEN 'concluido' WHEN 'cancelar' THEN 'cancelado' ELSE 'pendente' END,
   versao=versao+1,updated_at=clock_timestamp() WHERE id=fid RETURNING * INTO result;
 END IF;
 INSERT INTO public.mimo_lead_followup_historico(empresa_id,follow_id,lead_id,ator_id,acao,operacao_id,requisicao,anterior,atual)
 VALUES(_empresa,fid,lid,ator,acao_n,op,_dados,CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(result));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mimo_lead_followup_operar(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mimo_lead_followup_operar(uuid,jsonb) TO authenticated;