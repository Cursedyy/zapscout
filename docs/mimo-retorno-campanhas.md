# Investimento e retorno por campanha

A visão `/mimo/retorno-campanhas` é separada do dashboard legado do CRM. Administração, gestão e marketing podem abrir a página. Não altera pedidos, importações, campanhas, permissões ou integrações externas.

## Fontes e limite de atribuição

- Investimento e leads informados pelo Meta: `mimo_meta_ads_metricas`, leitura autenticada filtrada por empresa.
- Coorte CRM: apenas `id`, `empresa_id` e `entrada_em` de `mimo_leads`. Marketing recebe somente agregados, seguindo a leitura restrita já usada no dashboard; nenhuma identidade ou linha individual sai do servidor.
- Pedidos: projeção canônica `mimo_pedidos_conversao`, com IDs únicos, vínculo `lead_id`, status atual, total em centavos e primeira confirmação. Administração/gestão usam a leitura autenticada existente. Marketing não passa a acessar pedidos: esses indicadores ficam indisponíveis, não zero.

Não existe um identificador estável de campanha/anúncio comum nas fontes: o CSV Meta atual importa **nomes**, enquanto o lead pode ter textos editáveis e uma referência de anúncio originada no webhook. Não há mapa verificado entre essa referência e as linhas Meta, nem centro de custo compartilhado. Os UUIDs das campanhas comerciais de promoção também não vinculam os pedidos/relatórios Meta. Assim, coincidência exata ou aproximada de nomes **não** atribui receita nesta visão.

A entrega mostra investimento, leads Meta e CPL Meta por nome importado. Leads CRM, pedidos, receita atribuída, CAC e ROAS por campanha ficam indisponíveis enquanto não houver vínculo comprovado. A captação do CRM e os pedidos/receita conhecidos aparecem em **Não atribuídos**, separados dos números Meta. Isso não resolve a atribuição ponta a ponta; o próximo passo de domínio seria definir uma chave comum e sua captura verificável, inclusive tratamento do histórico. Nenhuma migração ou vínculo presumido foi criado.

## Período, contagens e unidades

O período, de até um ano, usa datas comerciais de São Paulo. A coorte inclui leads que entraram nele; pedidos da coorte exigem `lead_id` exatamente igual e primeira confirmação dentro do mesmo intervalo. Contam estados atuais confirmado/faturado/enviado/entregue; cancelados/rascunhos não contam. Receita faturada soma apenas os estados faturado/enviado/entregue. São valores atuais dos pedidos, não recebimentos, lucro nem receita causada pela mídia.

Pedidos do período sem lead na coorte aparecem separadamente, com quantidade e receita próprias, sem entrar no total da coorte. Valores legados `mimo_leads.valor_pedido`/`conversao_em` não são lidos nem somados.

Cada pedido e lead é contado uma vez pelo ID. Meta é deduplicado por ID e validado contra a chave única da importação; snapshots conflitantes são recusados. As consultas paginam até o total exato e rejeitam consulta incompleta, mudança na contagem ou mais de 20 mil registros, pedindo redução do período.

Somente linhas Meta inteiramente dentro do período entram no cálculo. Períodos parciais são avisados e excluídos. Linhas do mesmo anúncio com períodos sobrepostos, ou linhas agregadas sobrepostas a detalhes, tornam o total da campanha indisponível para evitar soma duplicada. Datas não sobrepostas e anúncios distintos podem ser somados. A análise conserva os nomes importados; não tenta conciliá-los com textos do CRM.

Investimento Meta em reais é convertido para centavos inteiros antes da soma. Pedidos canônicos já estão em centavos. `CPL Meta = investimento / leads Meta`, apenas com dados completos e denominador positivo; zero conhecido é exibido como zero, dado ausente como “—”. Leads Meta nunca aumentam o número de leads CRM. O filtro de campanha é exato e afeta só a tabela importada; o bloco não atribuído continua mostrando o período inteiro.

## Verificação

`npx vitest run --config vitest.mimo-retorno.config.ts --configLoader runner`

Fixtures sintéticas cobrem vínculo exato pedido→lead, nomes iguais sem atribuição presumida, empresa/cargo, não atribuídos, duplicações, sobreposições, ausência/zero, limites de período, paginação incompleta e interface. Sem chamada ou escrita externa.
