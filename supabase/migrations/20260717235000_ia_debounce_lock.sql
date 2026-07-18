-- Corrige condição de corrida no debounce: com o cron rodando a cada 5s,
-- duas execuções concorrentes podiam pegar o mesmo lote de mensagens antes
-- da primeira limpar o buffer (SELECT sem trava, clear só no final) —
-- causava reprocessamento da mesma mensagem, classificado incorretamente
-- como "bot em loop" na segunda passada.
ALTER TABLE ia_conversas
  ADD COLUMN IF NOT EXISTS debounce_processando_desde timestamptz;

COMMENT ON COLUMN ia_conversas.debounce_processando_desde IS 'Setado atomicamente (UPDATE...WHERE IS NULL) quando uma execução do cron process-ia-debounce reivindica o lote — impede que outra execução concorrente pegue a mesma conversa. Null = livre.';
