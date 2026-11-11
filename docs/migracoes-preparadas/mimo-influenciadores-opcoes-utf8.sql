-- Unicode escapes keep campaign choices stable through non-UTF-8 transports.
ALTER TABLE public.mimo_influenciadores
 DROP CONSTRAINT mimo_influenciadores_visualizacoes_check,
 DROP CONSTRAINT mimo_influenciadores_nicho_check,
 DROP CONSTRAINT mimo_influenciadores_parceria_check,
 DROP CONSTRAINT mimo_influenciadores_etapa_check;

ALTER TABLE public.mimo_influenciadores
 ADD CONSTRAINT mimo_influenciadores_visualizacoes_check CHECK(visualizacoes IN (
  U&'At\00E9 1 mil', U&'Mais de 1 mil at\00E9 5 mil',
  U&'Mais de 5 mil at\00E9 20 mil', 'Mais de 20 mil')),
 ADD CONSTRAINT mimo_influenciadores_nicho_check CHECK(nicho IN (
  U&'Maternidade e fam\00EDlia', U&'Alimenta\00E7\00E3o e receitas',
  'Lifestyle e rotina', 'Outros')),
 ADD CONSTRAINT mimo_influenciadores_parceria_check CHECK(parceria IN (
  'Recebimento de produtos (permuta)', 'Parceria remunerada', U&'Ambas as op\00E7\00F5es')),
 ADD CONSTRAINT mimo_influenciadores_etapa_check CHECK(etapa IN (
  'Novo', U&'Em an\00E1lise', U&'Pr\00E9-selecionado', 'Contatado',
  'Aprovado', 'Confirmado', U&'N\00E3o selecionado', 'Desistiu'));

NOTIFY pgrst, 'reload schema';
