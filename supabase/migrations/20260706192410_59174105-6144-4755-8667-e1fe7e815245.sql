
ALTER PUBLICATION supabase_realtime ADD TABLE public.campanhas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campanha_dispatch_logs;
ALTER TABLE public.campanhas REPLICA IDENTITY FULL;
ALTER TABLE public.campanha_dispatch_logs REPLICA IDENTITY FULL;
