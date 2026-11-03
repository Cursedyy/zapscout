# Carteira MiMo — implementação e liberação

## Implementado
- Menu Carteira separado dos leads, para administrador/gestor e vendedores; identidade visual e componentes MiMo preservados.
- Lista de 30 unidades por página, busca e filtros no servidor por rede, grupo, região, potencial, situação e responsável. Atalhos Para hoje, Atrasados e Sem próxima ação.
- Ficha com cadastro, contatos de proprietário/comprador, atividades, negociações e histórico legível e paginado.
- Contatos compartilháveis entre unidades; vendedor não pode editar um contato que afete unidades fora da sua carteira. WhatsApp é apenas um atalho manual, sem envio nem registro automático de mensagem.
- Agendamento, conclusão com resultado e reagendamento. Auditoria das operações e concorrência na edição de unidades/contatos.
- Distribuição de unidades em lote por gestão; não altera permissões dos membros nem reatribui leads existentes implicitamente.
- Importação Excel/CSV com mapeamento, sugestões de rede confirmadas pelo usuário, seleção e correção de CNPJ, prévia paginada e preservação dos dados originais.
- Importação de até 10 mil unidades em lotes de 50, progresso, pausa e retomada idempotente da mesma revisão. Registros coincidentes são sinalizados e não sobrescritos. Uma revisão corrigida do mesmo arquivo pode ser processada separadamente, preservando as unidades já existentes. Resultado de cada linha consultável por gestão.
- Uma negociação vincula várias unidades a um único lead autorizado, com proteção contra criação duplicada em retries. Pedidos são os existentes do lead, sem replicar valores nem alterar indicadores históricos.
- Atalhos para abrir o lead, montar pedido com cliente pré-selecionado e encontrar pedidos existentes.

## Fluidez
- Preloaders de seção e indicador de navegação em todos os menus MiMo, mantendo a navegação lateral.
- Leads e pedidos preservam a lista anterior ao filtrar/paginar; feedback de atualização e ações em andamento.
- Contexto leve compartilhado; ficha e importador carregados sob demanda. Excel é lido em Worker para não bloquear a interface.
- Tira-pedido carrega inicialmente até 50 clientes e permite buscar os demais no servidor. Busca de pedidos/clientes com debounce.
- Dashboard e Relatórios consultam fontes independentes em paralelo, preservando os cálculos puros e a autorização existente.
- Índices para lista e atividades. RLS da carteira calcula o escopo do próprio chamador uma vez por consulta, sem repetir a consulta de vínculo para cada unidade.

## Verificações
- Verificação TypeScript concluída sem erros; build completo concluído com código de saída 0.
- Suíte local de aceitação: 287 testes aprovados, usando `vitest run --exclude "**/*.e2e.test.ts" --testTimeout 15000 --maxWorkers 2`.
- PostgreSQL em memória: SQL executado; isolamento entre vendedores, contato compartilhado, versão concorrente, atribuição atômica, importação com retry e negociação multiunidade verificados.
- Testes de interface com respostas simuladas: filtros mantêm a lista visível, ficha/cadastro, WhatsApp manual e importação de linhas revisadas com contatos e origem preservados.
- Planilha real analisada somente para prévia: 2.716 unidades candidatas, 1.338 contatos, 34 linhas sinalizadas para revisão. Nenhuma linha foi importada no banco compartilhado.
- Base sintética de 10 mil unidades: página de 30 registros no offset 5.000 em aproximadamente 137 ms no PostgreSQL em memória. Não representa latência da rede nem SLA de produção.
- Testes E2E de campanhas que dependem de Supabase externo não fazem parte dessa rodada: a execução padrão dessas suítes falha na inicialização quando não há configuração externa.
- Inspeção visual autenticada não realizada: host de navegação/automação indisponível. Os testes de interação não substituem essa inspeção.

## Banco e liberação
`docs/migracoes-preparadas/mimo-carteira.sql` NÃO foi aplicado e permanece fora do journal. A gravação só será operacional quando as estruturas forem aplicadas. A prévia de importação funciona antes disso.

1. Confirmar o backup do banco compartilhado e revisar o SQL preparado.
2. Validar o SQL no ambiente de homologação da aplicação, incluindo JWT real, RLS com administrador/gestor/vendedores e políticas existentes da MiMo. As views usam `security_invoker` (PostgreSQL 15+).
3. Aplicar pelo mecanismo de migração autorizado, após a confirmação de backup exigida por AGENTS.md.
4. Revisar as 34 linhas sinalizadas e as sugestões de rede; iniciar com uma amostra pequena, conferir resultados e distribuição antes da carga completa.
5. Conferir o fluxo real de ficha, atividades, lead e pedido em desktop/celular. Manter os bloqueios e as permissões próprios do Tira-pedido.

Não foram importadas as abas Controle de Contatos, Pedido, Indicadores ou outras abas históricas. Não houve envio, publicação, alteração do banco compartilhado ou mudança da planilha original.
