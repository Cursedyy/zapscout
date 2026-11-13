# MiMo — primeira fatia comercial para 19/11/2026

## Escopo entregue

- Detalhe de lead abre em **Contexto**: entrada, origem/campanha/anúncio registrados, últimas mensagens recebida/enviada em vínculos confirmados e evidências explícitas do webhook. Ausência de metadado não transforma WhatsApp em Meta Ads.
- Pedidos vinculados projetam apenas ID, número, estado canônico e total comercial; acesso ao Tira-pedido pesquisando o número existente. Confirmado/faturado/enviado/entregue compõem vendas; somente faturado/enviado/entregue compõem faturamento. Rascunho, cancelado e aguardando pagamento não contam. Valores legados do cadastro aparecem separados e nunca são copiados ou somados.
- Follow-ups internos no detalhe: agendar, reagendar, concluir, cancelar e consultar as últimas 100 ações. Observação obrigatória de até 500 caracteres; responsável comercial ativo autorizado no lead. Concluído/cancelado são terminais.
- Painel de follow-ups em **MiMo → Leads**, com próximos/hoje/atrasados, filtros de estado/responsável e abertura autorizada do lead. Os atrasados são os pendentes cujo instante já venceu; hoje são os restantes do dia de São Paulo; próximos são os demais pendentes. Encerrados não alertam.
- Data/hora é convertida e agrupada explicitamente em `America/Sao_Paulo`, independente do aparelho; relógio de contagem atualizado a cada minuto. Datas inválidas/infinito são recusadas. Datas passadas válidas são permitidas e ficam atrasadas, sem presunção de janela comercial não informada.
- Repetição idêntica de operação é idempotente; mudanças incrementam versão e exigem revisão em conflito. Falha mantém data, observação e responsável. Atualizar versão não sobrescreve a edição. Nenhum envio, cron, automação ou permissão de notificação foi adicionado.

## Segurança e limites preservados

- Empresa existente pelo slug, vínculo ativo, cargo comercial e leitura caller-scoped do lead são verificados em cada função. Vendedor só consulta/agenda no lead atualmente atribuído e autorizado; gestão administra. Marketing/administrativo não acessam esta escrita comercial.
- SQL preparado NÃO modifica permissões/RLS de tabelas existentes, membros, vínculos WhatsApp, pedidos ou valores legados. As novas tabelas têm GRANTs explícitos e RLS de leitura; escrita browser direta negada; RPC autenticada deriva ator de `auth.uid()` e bloqueia empresa/membros/lead antes de operar.
- Auditoria é append-only e autorizada pelo acesso atual ao lead. Responsável novo deve ter acesso ao lead, não apenas existir na empresa. Após reatribuição/desativação, o gestor pode reagendar para um responsável autorizado antes de concluir.
- Bindings são privados: somente projeção privilegiada de IDs confirmados após autorização do lead; números do remetente, owner, hash/credencial e custos não são retornados. Histórico de vínculo confirmado anteriormente é preservado mesmo pausado; não é prova de conexão ativa agora.
- Contexto não consulta a nova tabela. Schema/RPC ausente gera aviso inequívoco; sem contagens ou falso sucesso. Erro de rede não vira lista vazia. Painel recusa apuração acima de 2.000 registros; contexto recusa resumo incompleto acima de 500 pedidos. Esses limites são guardas técnicas, não limites de negócio.
- Formulários públicos/correções móveis, permissões globais, CSP, journal e dependências permaneceram intactos.

## Evidências desta etapa

1. `bunx vitest run --config vitest.comercial.config.ts --configLoader runner`: **75 testes passaram / 8 arquivos**. Inclui regressões de acesso/leads existentes; 21 testes PGlite executam o SQL preparado em PostgreSQL isolado com fixtures sintéticas.
2. Banco sintético: outra empresa, sem membership, inativo, vendedor colega, marketing/administrativo, responsáveis impedidos, escrita direta, retries, versões stale, transições terminais, auditoria, reatribuição e datas inválidas. Concorrência exercitada como dois escritores com mesma versão em sequência; PGlite não prova throughput de múltiplas conexões de produção.
3. Funções: middleware autenticado e identidade caller; ausência de schema/RPC e erros não simulam sucesso; contexto não depende de follow-ups.
4. Interface: indisponibilidade não mostra contagens, recuperação de leitura, edição preservada, retry com mesma operação, duplo clique bloqueado e lista abre lead.
5. Prévia autenticada real `http://localhost:8080/mimo/leads`, somente leitura, com conta existente: contexto abriu, consulta de pedidos carregou, aviso real de estrutura ausente apareceu no painel e no lead, botão agendar desabilitado. Chromium desktop e largura 390 px sem overflow; nenhum `pageerror`. Capturas temporárias em `/tmp/browser/mimo-comercial/`, sem dados pessoais incorporados ao repositório.
6. Validação automática de tipos/build: última entrada observada `build OK`. Não executado build/typecheck manual, conforme regras do ambiente.
7. Regressões dos formulários públicos móveis: `bunx vitest run --config vitest.influenciadores.config.ts --configLoader runner`: **53 testes passaram / 9 arquivos**, incluindo bootstrap com armazenamento bloqueado e recuperação de carregamento. Total desta entrega: **128 testes passaram**.

**Não homologado nesta etapa:** salvar e reler follow-up pela tela com banco aplicado; sessão real de gestor/vendedor/outros cargos; concorrência multi-conexão. Gravação real deliberadamente não ocorreu e não deve ser descrita como pronta para operar antes da migração.

## Arquivos

- Domínio/tipos: `src/lib/mimo-comercial.ts`, `src/lib/mimo-comercial-db.ts` (contrato aditivo explícito; arquivo gerado de tipos não editado).
- Leitura/escrita autenticada: `src/lib/mimo-comercial.server.ts`, `src/lib/mimo-comercial.functions.ts`.
- Telas: `src/components/mimo-lead-contexto-comercial.tsx`, `src/components/mimo-lead-followups.tsx`; integração em `mimo-lead-editor.tsx` e `mimo-leads-page.tsx`.
- Testes: `mimo-comercial.test.ts`, `mimo-comercial-db.test.ts`, `mimo-comercial.server.test.ts`, `mimo-comercial.functions.test.ts`, `mimo-lead-followups.test.tsx`, `vitest.comercial.config.ts`.
- SQL: `docs/migracoes-preparadas/mimo-lead-followups.sql`; documentação e tarefas em `docs/mimo-comercial-prontidao.md`, `roadmap.md`. `AGENTS.md` foi lido e preservado: a ferramenta recusou acréscimo de arquitetura pelo orçamento excedido; nenhuma regra anterior foi condensada ou alterada.

## Próximos passos de migração — NÃO executados

1. Verificar backup recuperável do banco compartilhado e registrar evidência real antes de qualquer aplicação.
2. Revisar o SQL preparado e dependência existente `pode_ver_mimo_lead`; confirmar que preserva exatamente a política atual. Não ampliar acesso dos colegas nesta migração.
3. Com autorização de aplicação, enviar o conteúdo SQL preparado integral ao mecanismo oficial de migrações Lovable Cloud, em uma transação, incluindo GRANTs/RLS/triggers/RPC. Só então registrar a fonte aplicada no journal pelo procedimento do projeto e atualizar tipos gerados; não criar segunda aplicação do mesmo SQL.
4. Verificar grants/policies, capacidade e RPCs; realizar homologação autorizada com lead e responsáveis reais designados, gravar/reabrir/reagendar/concluir/cancelar e ler auditoria. Não usar dados fictícios em produção.
5. Revisão do usuário e publicação posterior. Nenhuma publicação, SQL produtivo ou alteração de dados nesta entrega.

## Decisões pendentes para operação até 19/11

- Acesso compartilhado à entrada versus assumir/atribuir lead: depende de resposta do usuário; vendedores continuam com acesso atual. A necessidade de todos enxergarem a entrada não foi ativada por esta etapa.
- Identificação/confirmação dos três números: pendente; nenhum novo vínculo foi criado, e contatos por números não confirmados não aparecem como comerciais.
- Backup/aplicação do SQL e homologação persistente: pendentes. Até lá contexto funciona, agenda se identifica explicitamente como indisponível.