# Revisão funcional e navegação MiMo — 04/11/2026

## Escopo e evidências

Revisão das dez rotas do menu, testes automatizados de domínio, permissões, banco isolado e componentes reais com servidor simulado. Os testes desta rodada não fazem gravações na produção, não conectam aparelhos e não enviam mensagens.

Primeira rodada: **218 testes em 25 arquivos**, todos aprovados. Após as correções: **246 testes em 29 arquivos** aprovados na suíte completa, mais **7 testes do preload de dados** aprovados separadamente; total de **253 testes em 30 arquivos**. Comando da suíte: `node node_modules/vitest/vitest.mjs run mimo --configLoader runner --testTimeout 15000 --maxWorkers 2`.

TypeScript sem erros e build de produção com código de saída 0. Log do build em `.cache/mimo-auditoria-build.log`.

| Tela | Verificações automatizadas |
| --- | --- |
| Dashboard | Fórmulas e coorte, oito indicadores, estado vazio, limite de datas, cache inicial e controle de acesso |
| Leads | Pesquisa e paginação, abertura do cadastro, validações de domínio, duplicados, permissões, histórico e prioridade |
| Carteira | Filtros preservando lista, cadastro/ficha/contatos, atividades e negociação, revisão da importação, idempotência e isolamento no PostgreSQL em memória |
| Tira-pedido | Criação/salvamento/reabertura, cálculos, descontos, modelos, status e PIX, faturamento/expedição, versões/restauração, propostas, filtros e rascunho após reabrir |
| Campanhas | Rota revisada: exibe aviso de etapa ainda não liberada; não possui operações implementadas para testar |
| Meta Ads | Parser, campos ausentes, deduplicação, permissões na interface, erro de leitura, troca concorrente de CSV e confirmação da importação |
| Relatórios | Coorte/comparação, CSV seguro, permissões, período válido e bloqueio da exportação durante atualização |
| Perdas | Agrupamento, preservação da tabela durante filtros e rejeição de intervalo invertido |
| Equipe | Ações por papel, confirmação para desativação, erro de rede com nova tentativa e revalidação das consultas |
| WhatsApp | Confirmação explícita, QR sob ação do usuário, histórico/paginação, isolamento do recebimento, assinatura/expiração/troca de número e autorização de gestão |

## Correções realizadas

1. Relatórios bloqueiam CSV enquanto o novo filtro carrega, quando o período é inválido ou quando a leitura falha. Isso evita exportar dados anteriores com o nome do novo período.
2. Meta Ads ignora leituras atrasadas de um arquivo substituído e mostra erro quando não consegue ler o CSV, em vez de gerar rejeição assíncrona sem tratamento.
3. Alterações em leads, negociações, equipe, pedidos e importações Meta revalidam as consultas MiMo relacionadas, mantendo os dados na tela. Indicadores e listas não ficam com o cache anterior após a gravação. Consultas do CRM pessoal não são invalidadas.
4. Equipe diferencia falha de carregamento de uma suposta negação de acesso e permite tentar novamente. Trocar a origem de uma transferência limpa um destino igual à origem.
5. Pesquisa de pedidos limita a entrada aos 100 caracteres aceitos pelo domínio, evitando uma exceção na renderização por busca longa.
6. Dashboard valida o máximo de um ano antes da consulta. Perdas valida a ordem das datas, preserva a tabela anterior e informa a atualização em andamento.
7. WhatsApp consulta novamente o estado ao abrir, com cache curto, para reduzir a exibição de conexão e confirmação antigas.

## Carregamento entre telas

- O layout aquece os módulos de todas as rotas permitidas ao papel. A fila começa após 100 ms e avança entre módulos sem esperar consultas lentas de outras páginas.
- Uma segunda fila prepara as consultas iniciais em segundo plano, usando as mesmas chaves e filtros que as telas usam. React Query compartilha leituras em andamento e reaproveita dados frescos.
- Dashboard e Relatórios compartilham o cálculo das datas iniciais com o preload, evitando consultas distintas por diferenças de filtro.
- Apontar, focar pelo teclado ou tocar um menu prioriza seus módulos e dados. O preload automático de rota do link foi substituído por esse caminho, evitando executar os guardas de autenticação só por passar o mouse.
- A navegação efetiva mantém os guardas de autenticação e cada leitura mantém sua autorização no servidor. A fila é cancelada ao sair da MiMo e não aquece páginas fora do papel.
- Economia de dados ou conexão 2G suspende o aquecimento automático. Dados vencidos continuam sujeitos a consulta; o primeiro acesso e a latência do servidor não têm garantia de espera zero.
- Testes verificam fila independente de leitura lenta, priorização, cancelamento, repetição após falha, isolamento dos destinos e reaproveitamento de dados sem segunda chamada.

## Limites da revisão

O serviço de acesso ao navegador retornou `The browser access host is unavailable`. Portanto, não houve inspeção visual autenticada em desktop/celular nem medição de latência real de navegação. Testes de interface com respostas simuladas não certificam o pareamento real, a entrega no WhatsApp, a disponibilidade atual da Jadlog nem todas as operações contra o banco compartilhado.

Campanhas continua sendo uma tela de etapa não liberada. Isso é uma funcionalidade ausente, não um teste aprovado de campanhas operacionais.
