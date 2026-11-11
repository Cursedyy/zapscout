# Influenciadores MiMo — novembro de 2026

Implementação: formulário público em `/influenciadores`, sem conta; painel privado em `/mimo/influenciadores`, disponível para administração, gestão e marketing. Nenhum disparo automático.

As sete perguntas das imagens foram incorporadas. WhatsApp e aceite completam o cadastro. O formulário solicita o número aproximado de seguidores para permitir tanto os filtros originais (até 5 mil, até 20 mil, até 50 mil, acima de 50 mil) quanto a distribuição da meta: Nano de 1.000 a 4.999 (60), Micro de 5.000 a 29.999 (240), Média de 30.000 a 100.000 (100). As fronteiras foram definidas sem sobreposição. Perfis fora das faixas permanecem na seleção.

Meta de 400 baseada em status Confirmado; aprovação não conta como confirmação. Seguidores e visualizações são autodeclarados. As faixas de visualização também são disjuntas. Formulário não coleta endereço, CPF ou dados bancários.

O painel oferece busca, filtros, ordenação, paginação, ficha, WhatsApp e perfil clicáveis, histórico de avaliação, exportação filtrada e atualização a cada 30 segundos. Edições usam versão otimista para evitar sobrescrever outra avaliação. Histórico é somente de acréscimo. Contagens abrangem todos os cadastros da campanha.

O envio público passa por endpoint com validação, checagem de origem, honeypot, limite de tamanho e limite persistente de 30 tentativas por IP/hora. Em Cloudflare, usa exclusivamente `cf-connecting-ip`, com hash diário, sem armazenar IP em claro. Sem esse cabeçalho, todas as requisições compartilham a chave local. O RPC de inscrição é exclusivo do serviço e escolhe a empresa MiMo ativa no banco. Visitantes não têm leitura nem escrita direta nas tabelas. Repetição de WhatsApp ou rede/perfil na mesma campanha retorna a mesma confirmação genérica, sem sobrescrever o cadastro ou divulgar a existência de um contato.

## Ativação

1. Migração `0032_mimo_influenciadores` aplicada em 11/11/2026 pelo migrador Drizzle, após conferência das 32 migrações anteriores e do registro de backup recuperável de 08/11/2026 às 11:35:57 UTC. Hash: `61c4cb81c6c7960edac45d0fd23b7a59fea174a529e65140bb1b297945b69e1c`. Testes isolados de atomicidade, rollback integral e recusa de reaplicação aprovados.
2. Confirmar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no servidor existente; a chave nunca entra no navegador.
3. Publicar a versão do painel, testar uma inscrição controlada e conferir o registro no painel com usuário autorizado.
4. Compartilhar o endereço público do domínio existente seguido de `/influenciadores`. Não divulgar enquanto o banco e a publicação não estiverem concluídos.

Validação local: `node node_modules/vitest/vitest.mjs run --config vitest.influenciadores.config.ts`. Testes de banco usam PostgreSQL isolado em memória, sem gravar inscrições no banco real.

Em 11/11/2026: 18 testes aprovados e `tsc --noEmit` aprovado. A checagem visual no navegador não foi realizada: o host de acesso ao navegador estava indisponível. Migração aplicada e verificada com 33 registros no journal, três tabelas com RLS e RPC público acessível somente ao serviço. Publicação e teste real em andamento.

## Correção de opções em 11/11/2026

A aplicação de 0032 passou por um transporte que interpretou UTF-8 como Windows-1252, corrompendo os acentos das quatro restrições de opções no banco. O formulário enviava as opções corretas e recebia erro 23514. A migração corretiva `0033_mimo_influenciadores_opcoes_utf8` usa apenas ASCII com escapes Unicode SQL e preserva o histórico de migrações. Não altera permissões ou cadastros existentes. As restrições antigas foram substituídas em uma única transação pelo migrador; o banco foi conferido com 34 registros e hash `8e8052c6f7304eab11acc29927d87f53e9b967a4b0b69bc6e9b414ffbef6ca96`.

Validação: 19 testes aprovados, incluindo reprodução da corrupção e todas as 48 combinações das opções, etapas de seleção e negação de leitura pública. Teste com o papel service_role no banco de produção aceitou uma inscrição com acentos e status Novo; a transação foi revertida e a lista permaneceu sem cadastros fictícios. Não houve teste HTTP pelo navegador nesta correção. A correção de banco já vale para o formulário publicado, sem necessidade de alterar seu link.

## Duplicidade, integridade e exclusão da lista — 11/11/2026

A migração 0034_mimo_influenciadores_duplicidade foi aplicada pelo migrador sobre as 34 migrações verificadas, preservando o registro de backup recuperável já conferido. O banco contém 35 migrações; hash final 84ce4e9ffaf6c794dcc78a144d600ecf57a8d04332b96030611c4a351d6bdc07.

O telefone é padronizado no servidor e no banco: pontuação, DDI 55/0055 e celular antigo sem o nono dígito convergem para a mesma chave. Dois índices únicos por empresa bloqueiam telefone ou rede/perfil repetidos, independentemente da campanha e mesmo em caminhos diretos de inserção. O RPC usa a inserção atômica e retorna duplicado quando nenhum registro novo é criado. O endpoint responde HTTP 409 com aviso genérico, sem expor dados da inscrição anterior.

Excluir da lista exige confirmação na ficha e autorização de administração, gestão ou marketing. Uma função autenticada verifica empresa, papel ativo e versão; registra data, responsável e histórico sem apagar o registro original. A lista, exportação e indicadores consultam apenas registros ativos. Identificadores de registros excluídos continuam reservados para impedir novas duplicatas.

Conferência do banco antes da mudança: um cadastro ativo, zero duplicados e zero cadastros com campos obrigatórios ausentes. Testes de omissão cobrem cada campo no endpoint e no banco. O teste de interface confere a exibição de todos os dados relevantes e a atualização da lista após exclusão. Suite: 27 testes aprovados. Testes de produção de duplicidade, exclusão com ator autorizado, histórico e bloqueio após exclusão foram executados em transações revertidas; nenhum cadastro real foi alterado. Teste HTTP no navegador ainda não realizado.
