-- PREPARADO, NÃO APLICADO. Exige backup recuperável verificado e aplicação pelo migrador oficial.
-- Etapa 1 de 2 (migração própria): o novo valor de enum só pode ser usado após o commit desta etapa.
ALTER TYPE public.empresa_papel ADD VALUE IF NOT EXISTS 'lider_marketing';