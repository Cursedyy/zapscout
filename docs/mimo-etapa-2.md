# MiMo — Etapa 2

## Entrega

- Área exclusiva `/mimo`, com Dashboard, Leads, Campanhas e Relatórios em estados vazios.
- Identidade visual e componentes existentes do ZapScout.
- Nome e papel do usuário autenticado; saída com limpeza dos dados em cache.
- Sem seletor de empresa, edição de papel, CRM, indicadores ou integrações.

## Proteção

- Layout pathless privado, sem renderização privada durante SSR; sessão validada antes de entrar nas páginas.
- Visitantes direcionados ao login existente `/login`.
- Verificação de acesso ao navegar na MiMo por uma função autenticada no servidor.
- Leituras via cliente do usuário, sob as políticas existentes: empresa fixa pelo slug `mimo`, empresa ativa e vínculo ativo.
- Nenhum ID de usuário ou empresa é aceito do navegador para decidir acesso.
- Sem autorização, retorna somente `{ autorizado: false }` e exibe acesso negado, sem páginas ou dados privados.
- Nenhuma operação de escrita adicionada. Tabelas, políticas, webhook e IA ficaram intactos.
- O login existente continua direcionando ao painel ZapScout. Após entrar, o usuário pode acessar `/mimo`; não foi alterado o fluxo atual de login.

## Arquivos

- `src/routes/_authenticated/route.tsx`
- `src/routes/_authenticated/mimo.tsx`
- `src/routes/_authenticated/mimo.index.tsx`
- `src/routes/_authenticated/mimo.leads.tsx`
- `src/routes/_authenticated/mimo.campanhas.tsx`
- `src/routes/_authenticated/mimo.relatorios.tsx`
- `src/components/mimo-vazio.tsx`
- `src/lib/mimo-acesso.ts`
- `src/lib/mimo-acesso.server.ts`
- `src/lib/mimo.functions.ts`
- `src/lib/mimo-acesso.test.ts`
- `src/lib/mimo.functions.test.ts`
- `AGENTS.md`, `roadmap.md` e este relatório.
- A árvore de rotas foi regenerada automaticamente pelo framework.

## Testes executados

- `bunx vitest run src/lib/mimo-acesso.test.ts src/lib/mimo.functions.test.ts`: 12 testes aprovados.
- Administrador, gestor e vendedor ativos: testes da decisão de acesso e das consultas do servidor, com banco simulado.
- Sem vínculo, vínculo inativo, empresa inativa e erro de permissão: acesso negado nos testes.
- Filtros das consultas: empresa fixa e somente o perfil e vínculo do usuário autenticado.
- Playwright real: administrador acessou `/mimo` e navegou pelas quatro páginas.
- Playwright real: visitante foi direcionado ao login em todas as quatro páginas.
- Requisição direta à função sem sessão não retornou autorização nem dados da MiMo; o transporte retornou erro serializado com HTTP 200.
- Saída e tentativa de retorno à MiMo: direcionamento ao login.
- Aplicação existente: painel `/app` e página inicial abriram, sem erros JavaScript observados.
- Banco real, com sessão do administrador: `empresa_papel_de` retornou administrador; `is_membro_empresa` retornou falso para UUID sem vínculo.
- Logs de compilação: build OK.

## Pendências de validação real

Existe somente um membro ativo na MiMo, com papel administrador. Não foram criados membros de teste nem alterados papéis reais.

Falta validar a interface e a chamada direta ao servidor com sessões reais de gestor, vendedor e usuário autenticado sem vínculo. Esses cenários passaram nos testes automatizados, mas a cobertura real não foi concluída por falta dessas sessões autorizadas.

As demais páginas existentes não receberam verificação individual exaustiva; a página inicial e o painel atual foram verificados e nenhuma página existente foi modificada.

Nenhuma etapa seguinte foi iniciada. Publicação não executada.