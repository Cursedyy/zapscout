CREATE OR REPLACE FUNCTION public.mimo_retomada_elegivel(_empresa uuid, _vinculo uuid, _lead uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT EXISTS (
   SELECT 1 FROM mimo_leads l
   WHERE l.empresa_id=_empresa AND l.id=_lead
     AND l.qualificacao='pendente' AND l.etapa IN ('novo','contato_realizado')
     AND EXISTS (SELECT 1 FROM mimo_whatsapp_eventos e WHERE e.empresa_id=_empresa
       AND e.vinculo_id=_vinculo AND e.lead_id=_lead AND e.direcao='recebida')
     AND (
       SELECT e.direcao='enviada' FROM mimo_whatsapp_eventos e
       WHERE e.empresa_id=_empresa AND e.vinculo_id=_vinculo AND e.lead_id=_lead
       ORDER BY e.created_at DESC, (e.direcao='recebida') DESC
       LIMIT 1
     )
     AND NOT EXISTS (SELECT 1 FROM mimo_agente_conversas c WHERE c.empresa_id=_empresa AND c.lead_id=_lead
       AND (c.estado<>'agente' OR c.piloto OR c.followup_bloqueado OR c.vinculo_id<>_vinculo))
     AND NOT EXISTS (SELECT 1 FROM mimo_agente_alertas a WHERE a.empresa_id=_empresa AND a.lead_id=_lead
       AND a.tipo='lead' AND (a.encaminhamento_fila_id IS NOT NULL OR a.estado IN ('pendente','reservada','enviando','aceita','incerta')))
     AND NOT EXISTS (SELECT 1 FROM mimo_whatsapp_eventos e WHERE e.empresa_id=_empresa
       AND e.vinculo_id=_vinculo AND e.lead_id=_lead AND e.direcao='recebida'
       AND e.texto ~* '(descadastr|não quero mais|nao quero mais|não me envie|nao me envie|sem interesse|não tenho interesse|nao tenho interesse|^[[:space:]]*(pare|stop|desisto)[.![:space:]]*$)')
 );
$$;
