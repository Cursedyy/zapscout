-- Finaliza somente a tentativa consumida pelo callback que confirmou a falha.
-- Mantém o estado consumido e expira sua capacidade de salvar uma credencial.
CREATE FUNCTION public.mimo_nuvem_oauth_falhar(_hash text,_empresa uuid,_loja text,_ator uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.mimo_nuvem_oauth_acesso(_empresa,_ator);
 PERFORM pg_advisory_xact_lock(hashtextextended(_empresa::text,0));
 UPDATE public.mimo_nuvem_oauth_estados
 SET expira_em=least(expira_em,clock_timestamp())
 WHERE hash=_hash AND empresa_id=_empresa AND loja_id=_loja AND ator_id=_ator
   AND consumido_em IS NOT NULL AND finalizado_em IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.mimo_nuvem_oauth_falhar(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mimo_nuvem_oauth_falhar(text,uuid,text,uuid) TO service_role;
