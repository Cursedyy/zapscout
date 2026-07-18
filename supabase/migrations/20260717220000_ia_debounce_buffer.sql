-- Debounce de mensagens do lead antes de acionar a IA: em vez de responder a
-- cada mensagem individual, o webhook empilha aqui e um cron (frequência
-- curta, registrado manualmente no Supabase) processa quando passa
-- ultima_atividade_em + 8s de silêncio (ou primeira_em + teto de segurança).
ALTER TABLE ia_conversas
  ADD COLUMN IF NOT EXISTS debounce_buffer jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS debounce_primeira_em timestamptz,
  ADD COLUMN IF NOT EXISTS debounce_ultima_atividade_em timestamptz;

COMMENT ON COLUMN ia_conversas.debounce_buffer IS 'Array de {texto, ts} — mensagens do lead recebidas durante a janela de debounce, ainda não enviadas pra IA.';
COMMENT ON COLUMN ia_conversas.debounce_primeira_em IS 'Timestamp da primeira mensagem do lote atual (não processado) — usado pro teto de segurança de ~28s.';
COMMENT ON COLUMN ia_conversas.debounce_ultima_atividade_em IS 'Timestamp da última atividade do lote atual (mensagem recebida) — usado pra checar 8s de silêncio.';
