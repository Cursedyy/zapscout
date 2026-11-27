# MiMo / Omie: painel de inadimplência

## Pedido

Feedback do cliente: "Inadimplência: Um painel para medirmos o índice de inadimplência no setor comercial interno".
Decisão do usuário: a fonte é o **Contas a Receber do Omie, somente consulta**. Nada é criado, alterado, baixado ou cancelado no Omie.

## Onde fica e quem acessa

- Rota `/mimo/inadimplencia`, item "Inadimplência" no menu MiMo.
- Somente **administrador** e **gestor** ativos da empresa fixa MiMo. O menu (`PAGINAS_POR_PAPEL`) só organiza a navegação; a server function `consultarInadimplenciaMimo` revalida a cada chamada a empresa fixa, o vínculo ativo (`exigirMimo`) e o papel antes de ler qualquer configuração ou chamar o Omie.
- Valores financeiros e nomes de clientes nunca vão para outros papéis.

## Configuração

Reaproveita as variáveis já usadas pela integração de CFOP (`docs/mimo-omie-cfop.md`), lidas apenas no servidor por `configOmie()`:

- `OMIE_APP_KEY`, `OMIE_APP_SECRET`: aplicativo Omie da MiMo (produção).
- `MIMO_OMIE_EMPRESA_ID`: UUID da empresa MiMo dona das credenciais. Se faltar ou não for a empresa do usuário, a tela mostra "Integração Omie indisponível" e nenhum valor.
- `MIMO_OMIE_MODO`: precisa continuar `simulacao` (ou ausente), senão `configOmie()` falha fechado. O painel é só de leitura, então não depende do modo.

As credenciais de teste (`OMIE_TESTE_*`) não são usadas aqui.

**Sem migração de banco.** A consulta é ao vivo e nada é gravado no Supabase.

## Chamadas ao Omie (somente leitura)

A lista fechada fica em `CHAMADAS_PERMITIDAS` (`src/lib/mimo-inadimplencia.server.ts`), e qualquer outra chamada é recusada antes do envio:

| Endpoint | Chamada | Uso |
| --- | --- | --- |
| `financas/contareceber/` | `ListarContasReceber` | Títulos (`pagina`, `registros_por_pagina: 500`, `apenas_importado_api: "N"`) |
| `geral/clientes/` | `ConsultarCliente` | Nome dos primeiros 15 clientes do ranking (`codigo_cliente_omie`) |
| `geral/vendedores/` | `ListarVendedores` | Nome dos vendedores (até 3 páginas de 100) |

Proteções:

- Limite rígido de **20 páginas × 500 = 10.000 títulos**. Se o Omie informar mais páginas, a consulta para na primeira página e mostra erro claro; nenhum indicador parcial é calculado.
- Se o total de páginas mudar no meio da leitura, a consulta é interrompida ("A lista de títulos mudou…").
- Pausa de 400 ms entre chamadas sequenciais. Erros de consumo (`429`, "consumo indevido/redundante") viram "O Omie limitou as consultas…"; credenciais recusadas, redirect, timeout de 25 s, falha de rede, HTTP/fault e formato inesperado têm mensagens próprias, sem corpo do provedor nem segredos.
- "Não existem registros" na primeira página = lista vazia legítima.
- Nomes de clientes/vendedores são complementares: se a consulta falhar, aparecem como "Cliente Omie 123"/"Vendedor Omie 7" com aviso, e os valores não mudam.
- A tela guarda o resultado por 5 minutos (React Query) e não reconsulta ao focar a janela, para evitar o bloqueio por consumo redundante do Omie.

### Filtro de datas: decisão provisória

A consulta **não** envia `filtrar_por_data_de/ate` ao Omie. Não foi confirmado, com dados reais, se esse filtro usa vencimento, emissão ou inclusão/alteração; se não for o vencimento, títulos seriam perdidos em silêncio. Por isso o servidor lê toda a carteira de contas a receber (até o limite acima) e filtra localmente por `data_vencimento`. Depois da validação com a conta MiMo, se o filtro da API for comprovadamente por vencimento, ele pode ser ativado para reduzir as chamadas.

## Campos lidos de cada título

Validados por `tituloOmieSchema` (zod, não estrito: campos extras são ignorados):

| Campo Omie | Obrigatório | Observação |
| --- | --- | --- |
| `codigo_lancamento_omie` | sim | Identidade; duplicados entre páginas são descartados |
| `codigo_cliente_fornecedor` | sim | Número ou texto numérico |
| `data_vencimento` | sim | `dd/mm/aaaa`; datas inexistentes invalidam o título |
| `valor_documento` | sim | Reais, convertido para centavos inteiros (`Math.round(v*100)`) |
| `status_titulo` | sim | Ver classificação abaixo |
| `codigo_vendedor` | não (tolerante) | Ausente, `0` ou inválido = "Sem vendedor informado" |
| `numero_documento`, `numero_parcela` | não | Apenas informativos |

`data_previsao` é ignorada: o atraso é medido pelo vencimento. Títulos sem campo obrigatório válido são ignorados e contados em um aviso. Se **nenhum** título for válido, a consulta falha em vez de mostrar zeros.

Classificação de `status_titulo` (sem acentos/maiúsculas, `_` vira espaço):

- Recebido: `RECEBIDO`, `PAGO`, `LIQUIDADO`
- Cancelado: `CANCELADO`
- Em aberto: `A VENCER`, `ATRASADO`, `VENCE HOJE`, `EM ABERTO`, `ABERTO`
- Qualquer outro (ex.: `PARCIAL`): **não classificado**, fora de todos os indicadores, com aviso listando os status encontrados. Não há palpite.

O vencimento é a referência para "vencido": um título em aberto com vencimento anterior a hoje é inadimplente mesmo que o Omie ainda não o rotule como `ATRASADO`.

## Definições

Todas as datas são dias corridos de **America/Sao_Paulo**. "Hoje" é a data de São Paulo no servidor no momento da consulta. O período filtra pela **data de vencimento** (inclusive nas duas pontas), com no máximo 366 dias. O período padrão vai do primeiro dia do mês, 11 meses atrás, até hoje.

Para os títulos com vencimento no período, sem cancelados e sem não classificados:

- **Total do período**: todos os títulos (recebidos + em aberto).
- **Recebido**: status recebido (independentemente do vencimento).
- **A receber (a vencer)**: em aberto com vencimento **hoje ou depois**. "Vence hoje" ainda não é atraso.
- **Base vencida**: títulos com vencimento **antes de hoje**, recebidos ou não.
- **Vencido em aberto**: títulos da base vencida ainda em aberto.
- **Cancelados**: mostrados à parte e excluídos de tudo.

**Índice de inadimplência (valor)** = valor vencido em aberto ÷ valor da base vencida × 100.
**Índice de inadimplência (títulos)** = quantidade vencida em aberto ÷ quantidade da base vencida × 100.

Os índices são calculados a partir de inteiros e arredondados a duas casas. Sem base vencida, o índice é "Sem base" (nunca 0%).

É uma **posição atual** ("dos títulos vencidos no período, quanto continua sem baixa hoje"), não um índice de pontualidade: um título pago com atraso conta como recebido. O Omie não informa a data de baixa nesta listagem.

Limitações conhecidas:

- **Baixas parciais** não são descontadas: o título em aberto conta pelo `valor_documento` integral até ser baixado. Se a conta usar baixas parciais, o índice fica superestimado (validar com dados reais).
- Juros, multas e descontos não entram; só `valor_documento`.

### Faixas de atraso (vencido em aberto)

Dias de atraso = hoje − vencimento (dias corridos, São Paulo): **1–15, 16–30, 31–60, 61–90, mais de 90**.

### Ranking de clientes

Clientes com títulos vencidos em aberto, ordenados por valor (desempate: maior atraso, código). A tela mostra os 30 primeiros; o CSV traz todos. Nomes são consultados para os 15 primeiros.

### Por vendedor

Agrupado pelo `codigo_vendedor` do título no Omie (não pelos responsáveis do CRM MiMo). Para cada vendedor: base vencida, vencido em aberto e índice por valor. Títulos sem vendedor ficam em "Sem vendedor informado".

## CSV

Gerado no navegador a partir do resultado já autorizado, sem nova chamada ao Omie. UTF-8 com BOM e separador `;` (Excel pt-BR). Valores em centavos são escritos sem ponto flutuante (`1234,56`). Todas as células passam por `celulaCsv` (`mimo-relatorio.ts`), que neutraliza fórmulas (`=`, `+`, `-`, `@`, tab, CR) com apóstrofo e escapa aspas.

## Arquivos

- `src/lib/mimo-inadimplencia.ts`: domínio puro (schemas, normalização, cálculo, CSV).
- `src/lib/mimo-inadimplencia.server.ts`: cliente Omie somente leitura, paginação e limites.
- `src/lib/mimo-inadimplencia.functions.ts`: server function com revalidação de acesso.
- `src/components/mimo-inadimplencia-page.tsx`, `src/routes/_authenticated/mimo.inadimplencia.tsx`: tela.
- `src/lib/mimo-inadimplencia.fixtures.ts`: fixtures **sintéticas**.

## Testes

`node node_modules/vitest/vitest.mjs run --config vitest.mimo-inadimplencia.config.ts --configLoader runner`

O fetch é sempre simulado; os testes nunca chamam a API real do Omie. Cobrem: normalização tolerante, cálculo dos índices, limites das faixas, ranking, vendedores, cancelados/não classificados, data de São Paulo, validação de período, CSV com neutralização, lista fechada de chamadas de leitura, paginação, limite de registros, mudança de paginação, mapeamento de erros sem segredos, nomes complementares, papéis negados/indisponibilidade na server function e estados da tela (dados, indisponível, erro, exportação).

## Pendências de validação com dados reais

1. Rodar o painel com a conta Omie da MiMo e conferir 2 ou 3 títulos com a tela do Omie (vencimento, valor, status).
2. Confirmar os valores reais de `status_titulo` (especialmente se existe status de baixa parcial) e se `codigo_vendedor` vem preenchido.
3. Conferir o volume total de títulos frente ao limite de 10.000 e o tempo de resposta.
4. Decidir se o filtro de datas da API pode ser ativado (ver "Filtro de datas").
5. Confirmar com o financeiro se a definição do índice (posição atual sobre títulos vencidos no período) atende ao pedido.
