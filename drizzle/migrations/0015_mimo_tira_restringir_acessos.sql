-- Corrige privilégios padrão do esquema aplicados automaticamente às estruturas novas do Tira-pedido.
-- Navegador: somente leitura pelas visões seguras e pelas tabelas de propostas/histórico de configuração (com RLS).
REVOKE ALL ON public.mimo_tira_config, public.mimo_tira_config_historico, public.mimo_tira_pedidos, public.mimo_tira_versoes, public.mimo_tira_propostas FROM anon, authenticated;
REVOKE ALL ON public.mimo_tira_config_segura, public.mimo_tira_pedidos_seguros, public.mimo_tira_versoes_seguras FROM anon, authenticated;
GRANT SELECT ON public.mimo_tira_config_historico, public.mimo_tira_propostas TO authenticated;
GRANT SELECT ON public.mimo_tira_config_segura, public.mimo_tira_pedidos_seguros, public.mimo_tira_versoes_seguras TO authenticated;
REVOKE ALL ON FUNCTION public.mimo_tira_redigir(jsonb), public.mimo_tira_assinatura_ok(jsonb,jsonb), public.mimo_tira_transicao_ok(text,text) FROM PUBLIC, anon;
