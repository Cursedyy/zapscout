# MiMo — Etapa 7: Relatórios semanais e exportação CSV

## O que foi feito
- Página `/mimo/relatorios` com período (até 13 semanas, padrão últimos 7 dias), filtros de campanha e origem.
- Comparação com o período anterior de mesma duração (7 dias = semana anterior) e variação percentual (vazia quando o anterior é ausente ou zero).
- Evolução semanal em blocos de 7 dias a partir do início; o último bloco é marcado como parcial.
- Leads por perfil e por origem; avisos de dados ausentes, linhas parciais do Meta, campanhas sem atribuição e limitações (CAC só de mídia).
- Exportações CSV: Resumo, Leads, Meta Ads e Pedidos fechados.

## Regras
- Todos os indicadores vêm de `calcularDashboard` (mesmas fórmulas e coorte do Dashboard). Os filtros de coorte foram extraídos para `filtrarLeadsPeriodo`, `filtrarMetricasPeriodo` e `ehPedidoFechado`, usados também pelas exportações.
- Ausente nunca vira zero: célula vazia no CSV, "—" na tela.
- Leads informados pelo Meta aparecem só como referência no resumo e no CSV do Meta; nunca são somados aos leads do CRM.
- Com origem diferente de Meta Ads, o CSV do Meta sai vazio e o investimento não é atribuído.
- CSV: UTF-8 com BOM, separador `;`, CRLF, decimais com vírgula, datas dd/mm/aaaa (horário de São Paulo). Textos iniciados por `= + - @ tab CR` recebem `'` na frente; aspas, `;` e quebras são escapadas.
- Campos exportados de leads: empresa, contato, perfil, origem, campanha, anúncio, entrada, etapa, qualificação. Não saem telefone, observações, IDs, responsável ou qualquer credencial.

## Segurança
- `relatorioMimo` usa `requireSupabaseAuth`, revalida vínculo ativo com a empresa fixa (`exigirMimo`) e só responde para administrador/gestor; vendedor recebe `permitido: false` sem nenhuma linha. Consultas usam o cliente do próprio usuário (RLS aplicada) e `empresa_id` da MiMo.
- O CSV é gerado no navegador a partir dos dados já autorizados; não há endpoint de download separado.

## Arquivos
- `src/lib/mimo-dashboard.ts` (filtros compartilhados extraídos, sem mudança de fórmula)
- `src/lib/mimo-relatorio.ts`, `src/lib/mimo-relatorio.functions.ts`, `src/lib/mimo-relatorio.test.ts`
- `src/components/mimo-relatorios-page.tsx`, `src/routes/_authenticated/mimo.relatorios.tsx`

## Testes
- 9 testes novos (igualdade com o dashboard, semana anterior, período vazio, semanas parciais, filtros, BOM/acentos, moeda/datas/vazios, fórmulas maliciosas, ausência de telefone/IDs). Suíte completa: 191 aprovados.
- Navegador como administrador: página abre sem erros, CSV de resumo baixado com acentos e vazios corretos.

## Limitações
- Não validado com dados reais (sem leads/CSV reais da MiMo) nem com sessões reais de gestor/vendedor (não existem membros com esses papéis).
