# MiMo — Etapa 6: Dashboard de indicadores comerciais

## Arquivos
- `src/lib/mimo-dashboard.ts` — cálculo puro (filtros, coorte, indicadores, séries, campanhas, avisos).
- `src/lib/mimo-dashboard.functions.ts` — server function autenticada; revalida vínculo e papel; empresa fixa.
- `src/components/mimo-dashboard-page.tsx` — cards, gráficos, tabela por campanha, avisos e estados vazios.
- `src/routes/_authenticated/mimo.index.tsx` — passa a exibir o dashboard.
- `src/lib/mimo-dashboard.test.ts` — 9 testes com dados controlados.

## Fórmulas (período em horário de Brasília)
- Leads gerados = leads do CRM MiMo com `entrada_em` no período (coorte).
- Investimento = soma de `investimento` das linhas Meta inteiramente dentro do período; linhas que cruzam o limite ficam fora e são avisadas; sem dado = "—".
- CPL = investimento ÷ leads gerados.
- Taxa de qualificação = leads da coorte com qualificação "qualificado" ÷ leads gerados × 100.
- CPQL = investimento ÷ leads qualificados.
- Novos clientes = leads da coorte em "pedido fechado", com valor e data de conversão até o fim do período.
- Taxa de conversão = novos clientes ÷ leads gerados × 100.
- CAC de mídia = investimento em anúncios ÷ novos clientes (rotulado como "de mídia"; outros custos não existem no sistema).
- Denominador zero → "—".

## Decisões
- Leads do Meta são exibidos só como referência e nunca somados ao CRM.
- Filtro de origem diferente de Meta Ads zera a atribuição de investimento (indicadores de custo ficam "—").
- Atribuição por campanha: nome da campanha gravado no lead igual ao do Meta (sem diferenciar maiúsculas). Leads/clientes sem campanha são avisados.
- Acesso: administradores e gestores; vendedores recebem aviso (o dashboard agrega todos os leads, além do que lhes cabe editar). Visitante é redirecionado ao login; sem vínculo, acesso negado pelo layout e pela server function.
- Período máximo: 1 ano; série diária até 62 dias, mensal acima.

## Testes
- 9 testes automatizados aprovados: 8 indicadores, perfis, separação Meta × CRM, linhas parciais, zeros/ausentes, filtros de campanha e origem, pedido sem valor, avisos de atribuição, validação de período.
- Interface como administrador: dashboard carrega sem erros com estado vazio e "—" nos indicadores.

## Limitações
- Sem dados reais ainda (CRM e Meta vazios na MiMo); conferência com dados reais pendente.
- Gestor e vendedor não validados com sessões reais (não há membros com esses papéis).
- CAC total indisponível: só custo de mídia.
