# Pesquisa e otimização do carregamento MiMo — 04/11/2026

## Resultado da pesquisa aplicado ao projeto

Foi feita uma pesquisa direcionada em documentação primária de TanStack, React, Vite, Chrome/web.dev, MDN e Supabase, confrontada com o código instalado. As recomendações abaixo priorizam fontes oficiais e problemas concretos encontrados no MiMo.

A mudança de maior retorno imediato é antecipar o que o usuário provavelmente abrirá, com orçamento de rede, aproveitando o mesmo cache da tela. Baixar todas as telas e buscar todos os relatórios ao entrar pode disputar recursos com a página que a pessoa está tentando usar. O TanStack documenta [pré-carregamento por intenção](https://tanstack.com/router/latest/docs/guide/preloading), e sua documentação de Query explica a [reutilização das consultas antecipadas](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching). A implementação mantém APIs disponíveis na versão instalada; páginas `latest` podem mostrar APIs posteriores.

## Diagnóstico no código existente

| Achado | Evidência | Consequência |
| --- | --- | --- |
| Especulação ampla ao entrar | `use-mimo-preload.ts` iniciava a fila em 100 ms e percorria todas as páginas permitidas | Downloads e leituras não solicitadas concorriam com a tela aberta |
| Relatórios e painel consultados automaticamente | `mimo-preload-dados.ts` tinha nove destinos com grupos de consultas | Para administrador, a entrada podia disparar todos esses grupos, mesmo sem intenção de navegar |
| Configuração de consulta dentro de componentes | Prefetch importava páginas de Leads, Tira-pedido e Meta Ads | Obter opções de cache também importava dependências de interface e editores |
| Hover/foco/toque concorrentes | Não existia deduplicação da tarefa inteira por destino | Eventos sobre o mesmo link repetiam o encadeamento, embora Query já deduplicasse consultas de mesma chave |
| Cache com configurações diferentes | Prefetch usava 60 s; algumas telas herdavam os 5 minutos globais | Política de atualização ficava distribuída e difícil de verificar |
| Encerramento de sessão | A fila era cancelada na desmontagem, mas a limpeza de cache começava antes disso | Uma tarefa ainda não iniciada podia voltar a consultar durante a saída |
| Trabalho pesado no servidor | Dashboard e relatórios paginam internamente em lotes de mil, até 20 mil registros por conjunto | Preload não elimina o custo dessas leituras e dos cálculos |

O router já utiliza separação de código e `defaultPreloadStaleTime: 0`. Portanto, não era necessário trocar o framework ou adicionar outro cache global. O menu MiMo possui seu próprio mecanismo porque o layout verifica autorização em `beforeLoad`; carregar código e consultas explicitamente permite manter as verificações reais de navegação e de servidor.

## Melhorias implementadas nesta etapa

1. **Orçamento automático:** no máximo dois destinos comerciais entre Leads, Carteira e Tira-pedido, excluindo a página atual. A etapa automática carrega somente módulos; não inicia consultas de dashboard, relatórios ou listas.
2. **Prioridade da tela aberta:** o trabalho automático aguarda consultas ativas. Usa `requestIdleCallback`, com fallback de timer em navegadores sem a API. A [MDN descreve a execução na ociosidade e suas limitações](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback); isso reduz disputa, mas não garante custo zero ao executar JavaScript.
3. **Intenção de navegação:** apontar, focar ou tocar no menu permitido antecipa código e dados daquele destino. Eventos simultâneos do mesmo destino compartilham a tarefa em andamento. Falhas permitem uma tentativa posterior.
4. **Rede e visibilidade:** evita especulação offline, com economia de dados ou em 2G; pausa em aba oculta e retoma quando as condições permitem. A [API de economia de dados](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData) é opcional e tratada como tal.
5. **Consultas fora da interface:** opções de Leads, Tira-pedido e Meta Ads foram movidas para módulos `.queries.ts`, compartilhados por telas e prefetch. As chaves existentes foram preservadas e essas opções declaram 60 segundos de atualização.
6. **Cancelamento explícito:** ao sair, cancela a fila antes de cancelar consultas, limpar o cache e encerrar a sessão. As permissões do servidor e as políticas de acesso ao banco continuam sendo a autoridade.

Nos testes, a etapa automática faz **zero chamadas ao prefetch de dados**, e o cenário com quatro destinos permitidos aquece somente dois destinos comerciais. Isso é evidência de redução do trabalho especulativo, não uma medição de milissegundos economizados no celular do usuário.

## O que foi conferido no banco

Consulta somente de leitura em `pg_indexes` confirmou, entre outros:

- Leads: índice por `(empresa_id, entrada_em DESC, id)` e índices de identidade normalizada.
- Meta Ads: índice por `(empresa_id, data_inicio)`.
- Carteira: índices por empresa/nome, empresa/responsável/nome e localização comercial.
- Membros: índices por usuário e por empresa/usuário.

Portanto, não há evidência para simplesmente adicionar índices genéricos. A próxima análise deve usar planos das consultas lentas e identidade equivalente à do usuário. O Supabase recomenda [analisar planos de execução](https://supabase.com/docs/guides/database/query-optimization) e possui orientações específicas de [desempenho com RLS](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations). Não foi executado `EXPLAIN ANALYZE`, nem alterado esquema, política ou dado comercial.

## Próximas melhorias, em ordem de prioridade

| Prioridade | Ação | Como decidir e validar |
| --- | --- | --- |
| 1 | Medir navegação autenticada em desktop e celular | Comparar entrada fria, menu antecipado, volta à tela e troca de filtro, por perfil |
| 2 | Carregar editores, PDF e gráficos apenas quando necessários | Inspecionar grafo de chunks e usar importação dinâmica em modais/ações quando a medição mostrar benefício |
| 3 | Padronizar as demais consultas e escopo de cache | Compartilhar opções e incluir empresa/usuário quando relevante; manter invalidação após gravações |
| 4 | Restringir invalidações após mudanças comerciais | Hoje o helper invalida todo prefixo `mimo-`; reduzir somente após mapear quais indicadores cada ação afeta |
| 5 | Diminuir custo do dashboard e relatórios | Medir payload/latência; considerar agregação autenticada no banco, preservando coorte, permissões e exportações |
| 6 | Antecipar a próxima página das listas | Fazer apenas com a página atual pronta e filtros estáveis; tabelas já paginadas não precisam de virtualização sem evidência |
| 7 | Avaliar rede entre aplicação e banco | Separar latência de autenticação, consulta e cálculo; mudar região ou infraestrutura somente com tracing |

O artefato local encontrado no início da auditoria tinha um chunk principal de 1.057.596 bytes sem compressão e chunks separados de gráficos (~397 KB), jsPDF (~386 KB) e html2canvas (~201 KB). Tamanho em disco não é tamanho transferido, nem prova que todos são baixados na entrada. A recomendação é preservar o carregamento sob demanda e medir o grafo realmente utilizado. [Vite documenta otimizações de chunks assíncronos](https://vite.dev/guide/features.html#async-chunk-loading-optimization), e o [Google explica a redução de JavaScript com code splitting](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting).

## Critérios de medição

- Registrar tempo entre clique e conteúdo útil, número de requisições, bytes transferidos e consultas duplicadas. Medir cache frio e quente separadamente.
- Usar [Chrome Performance](https://developer.chrome.com/docs/devtools/performance) para tarefas longas e rede; usar [React Profiler](https://react.dev/reference/react/Profiler) para descobrir renders caros antes de aplicar memoização indiscriminada.
- Acompanhar [Core Web Vitals](https://web.dev/articles/vitals): referências gerais de p75 são LCP até 2,5 s, INP até 200 ms e CLS até 0,1. São metas, não resultados desta auditoria. Para navegação interna, medir também o conteúdo útil da rota, pois essas métricas não substituem a experiência de troca de menu.
- Não usar teste sem login como prova de desempenho do MiMo: ele mede o redirecionamento ou a tela de login, não as consultas comerciais.

## Validação e limites

Comando reproduzível: `npm run test:mimo-performance`. Os 36 testes passaram. A suíte cobre agendamento, cache, deduplicação, permissões de destino, rede, aba oculta, falhas, cancelamento, reutilização de consultas e regressão de interface de Carteira/Tira-pedido. Os testes longos de interface usam timeout de 15 s; o primeiro ensaio concorrente com o build excedeu o limite anterior de 5 s em um cenário com várias ações, e a repetição completa terminou sem falhas.

Esta etapa não mede ganhos de p75 com usuários reais, não faz alterações no banco e não instala service worker para armazenar dados comerciais. As melhorias estão no código local até que haja commit e publicação desta versão.

TypeScript sem erros; lint das rotinas de preload, opções compartilhadas, testes associados e configuração aprovado; build de produção concluído com código de saída 0. Após o último ajuste de tipagem da verificação de visibilidade, os 15 testes do agendador foram executados novamente e passaram.
