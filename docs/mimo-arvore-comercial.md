# Árvore Comercial MiMo

Tela `/mimo/arvore-comercial`, exclusiva de administrador e gestor. Estudos são independentes do Tira-pedido: nenhuma tabela de pedidos, propostas ou preços operacionais é alterada.

## Base inicial e importação

A origem é `Arvore_Comercial_Matriz_.xlsx`, aba `ARVORE COMERCIAL`: 19 SKUs, seis canais, 114 combinações. A extração preserva custo, preço, impostos, FIDC, logística, comissão, RSNF, outros investimentos e preço sugerido, com 12 casas decimais. Não executa fórmulas do arquivo. A origem normalizada foi carregada privadamente na tabela `mimo_pricing_origens`, com RLS de administração/gestão. O repositório é público: os custos reais não são versionados nem incluídos nos bundles; testes publicados usam dados fictícios. O SKU M001 tem custos distintos entre canais; a interface sinaliza a diferença sem uniformizá-la.

Na tela, **Revisar importação inicial** mostra os valores originais, os anteriores, a contagem de novos/alterados e os avisos. **Confirmar importação** grava a base e sua origem/hash em transação. Hash já importado é rejeitado inclusive após edição posterior da base. A base inicial aguarda essa confirmação na interface; não foi gravada em nome de um usuário sem sua sessão.

## Cálculos e premissas

`src/lib/mimo-pricing.ts` usa BigInt em escala fixa de 12 casas. Valores monetários são formatados em centavos somente na apresentação. As frações são informadas como `0.15` para 15%. Ausente e zero são distintos.

- Faturamento: quantidade faturada × preço de tabela × (1 − desconto).
- Margem bruta: faturamento − impostos − custo industrial de todas as unidades entregues.
- Contribuição: margem bruta − despesas variáveis. Cada despesa tem uma única base: fração do faturamento, reais por unidade entregue ou reais por operação.
- Líquido estimado: contribuição − faturamento × rateio fixo. Rateio ausente mantém o resultado pendente; zero explícito é válido.
- Margens percentuais usam faturamento como denominador. Receita zero não produz percentual.
- Preço mínimo resolve custos não percentuais ÷ [quantidade × (1 − desconto) × (1 − impostos − despesas percentuais − meta)]. Denominador não positivo, volume insuficiente ou premissas ausentes não produzem preço mínimo válido.
- Comparativos por unidade rateiam bônus e despesas por operação pelos volumes faturados informados; sem volume para esse rateio, ficam indisponíveis.
- Totais incluem somente volumes previstos explicitamente. Margens são ponderadas pelas receitas. Totais incompletos ficam indisponíveis.

Distribuidor tem duas revendas; Venda Direta, Televendas e Broker têm varejista. Broker recebe comissão em despesas, sem etapa de aquisição/revenda. E-commerce e Marketplace encerram na venda da MiMo ao consumidor. Margem usa aquisição ÷ (1 − taxa); markup usa aquisição × (1 + taxa). A interface apresenta acréscimo, evolução e participação no PDV, sem chamar acréscimo de lucro líquido.

Políticas são mantidas dentro do documento versionado: canal, canal/UF e cliente/canal/UF, nessa precedência. Nulo herda, zero substitui. Cliente é buscado na Carteira; o banco rejeita referências a unidades inexistentes ou de outra empresa. Alíquotas são parâmetros da gestão; não há determinação tributária automática. Cada cenário preserva sua própria cópia das premissas e políticas.

## Persistência e segurança

Migrações `0020_mimo_arvore_comercial`, `0021_mimo_pricing_utf8` e `0022_mimo_pricing_origens`, aplicadas pelo migrador oficial Drizzle pg-proxy, em transações com trava e conferência de baseline. A segunda normaliza mensagens UTF-8 após decodificação do transporte Windows; a terceira mantém a origem privada fora do código público. Backup recuperável verificado conforme registro de 03/11/2026 em `mimo-carteira-implementacao.md` e checkpoint de liberação.

Tabelas próprias: `mimo_pricing_documentos` e `mimo_pricing_historico`. Uma base por empresa; cenários têm identidade e versão próprias. Histórico guarda todas as versões, origem de importação, hash, autor e data. RPC bloqueia o documento e confere versão antes de atualizar; navegador não tem privilégios de INSERT, UPDATE ou DELETE nas tabelas. Ambas têm RLS de leitura para administração/gestão da empresa MiMo ativa. Funções do servidor repetem autorização e validam os dados; resultados enviados pelo navegador não são persistidos.

## Verificação

`node node_modules/vitest/vitest.mjs run --config vitest.pricing.config.ts --configLoader runner`

Cobertura pública com 114 combinações fictícias: fórmulas, margem/markup, bonificação, desconto, rateio fixo, despesas com bases diferentes, exceções UF/cliente, Broker, preço mínimo, agregação ponderada, dados ausentes, duplicidades, cargos, empresas, escrita direta, reimportação e versões concorrentes. Testes React verificam prévia antes de confirmação, simulação sem gravação implícita e salvamento/reabertura de alternativa. Separadamente, reconciliação local conferiu as contribuições dos 114 registros reais contra os resultados armazenados no XLSX, com diferença absoluta máxima de 3,56 × 10⁻¹⁵.

No banco de produção, uma transação com ROLLBACK validou gravação/leitura por administrador, atualização por gestor, conflito de versão, hash repetido, histórico e bloqueio do marketing. Nenhum cenário de teste foi mantido.

Limite da verificação: o host de navegador e o controle nativo não estavam disponíveis; não foi possível conferir visualmente o fluxo em uma sessão real do usuário. Testes de interface e banco não substituem essa conferência visual.
