# Campanhas comerciais do MiMo

A aba `/mimo/campanhas` permite cadastrar as promoções de vendas da equipe: nome, datas de início e término, produtos participantes e texto de preços e condições. A promoção atual deve ser cadastrada pela equipe com os valores reais.

Administração, gestão e marketing podem criar, editar, publicar e arquivar. Vendedores consultam apenas campanhas publicadas, inclusive encerradas no filtro de todas as campanhas. Rascunhos e campanhas arquivadas ficam restritos à gestão e ao marketing. A vigência usa a data de São Paulo e inclui o primeiro e o último dia.

Os dados ficam em `mimo_campanhas_comerciais`, separados por empresa, com RLS e autorização repetida nas funções do servidor. O banco impede exclusão pelos usuários, troca de empresa e publicação sem produtos e condições. A versão incrementada pelo banco evita que a interface sobrescreva uma edição concorrente. Autor, último editor e horários são preenchidos pelo banco.

Migração `0019_mimo_campanhas_comerciais`, aplicada pelo migrador oficial Drizzle pg-proxy em uma transação com guarda do journal. Evidência de backup recuperável já confirmada em `docs/mimo-carteira-implementacao.md` (03/11/2026, 11:37:25 UTC). A verificação após aplicação confirmou RLS ativa, três políticas e nenhuma campanha de demonstração inserida.

Validação: cinco testes cobrindo regras de publicação e datas, formulário de cadastro, consulta por vendedor e execução do SQL em PostgreSQL isolado com isolamento entre empresas, rascunhos privados, bloqueio de escrita do vendedor, edição concorrente e bloqueio de exclusão. Checagem TypeScript e lint dos arquivos novos aprovados. Os testes de banco usam dados fictícios locais.
