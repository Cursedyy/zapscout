# Investimento e retorno por campanha

O retorno por campanha aparece no **Dashboard** da MiMo (`/mimo`), separado dos indicadores legados do CRM. Administração, gestão, marketing e líder de marketing veem a seção; vendedores veem só o próprio histórico. A leitura não altera pedidos, importações, campanhas, permissões ou integrações externas.

A seção tem dois blocos:

1. **Retorno por campanha (Meta)** — por campanha importada do CSV Meta, com atribuição pelo ID exato do anúncio.
2. **Retorno por código de campanha** — por código/centro de custo cadastrado pela MiMo (novo), que cobre ações Meta e fora do Meta.

## Fontes e limite de atribuição

- Investimento e leads informados pelo Meta: `mimo_meta_ads_metricas`, leitura autenticada filtrada por empresa.
- Coorte CRM: `id`, `empresa_id`, `entrada_em` e, após a migração, `campanha_codigo_id`/`campanha_codigo_origem` de `mimo_leads`. Marketing recebe somente agregados, seguindo a leitura restrita já usada no dashboard; nenhuma identidade ou linha individual sai do servidor.
- Pedidos: projeção canônica `mimo_pedidos_conversao`, com IDs únicos, vínculo `lead_id`, status atual, total em centavos e primeira confirmação. Administração/gestão usam a leitura autenticada existente. Marketing não passa a acessar pedidos: pedidos, faturamento, CAC e retorno ficam **indisponíveis (“—”), não zero**.
- Códigos de campanha: `mimo_campanhas_codigos`, vínculos `mimo_campanhas_codigos_meta` e investimentos manuais `mimo_campanhas_codigos_investimentos` (migração preparada, ver abaixo).

Nomes de campanha/anúncio, UTMs e os campos de texto “Campanha/Anúncio de origem” do lead **nunca** atribuem receita. Coincidência exata ou aproximada de nomes não cria vínculo. Os UUIDs das campanhas comerciais de promoção (`mimo_campanhas_comerciais`) também não vinculam pedidos/relatórios Meta.

## Código de campanha (centro de custo)

Atende ao pedido de “centro de custo ou código específico por ação” para medir investimento x retorno.

**Cadastro** (Meta Ads → *Códigos de campanha*): administração, gestão, marketing e líder de marketing criam códigos (ex.: `BF26`, 2–40 caracteres `A-Z 0-9 - _`), com nome, descrição, situação (ativo/arquivado) e os **IDs de campanha Meta** que pertencem ao código. O código é imutável depois de criado; cada campanha Meta pertence a no máximo um código. Gravações só por RPCs `security definer` que conferem empresa e cargo, com versão otimista e histórico append-only (`mimo_campanhas_codigos_historico`).

**Investimento manual**: para ações fora do Meta (evento, influenciador, material, outra mídia). Lançado em centavos com data de competência (não futura) e descrição; não é editado nem apagado — corrige-se anulando com motivo (fica no histórico) e lançando de novo.

**No lead**:

- *Manual*: campo “Código de campanha” no cadastro do lead (vendedores, gestão e administração). Só códigos ativos podem ser escolhidos; o banco valida empresa e código ativo e registra a origem `manual`.
- *Automático*: quando um evento recebido do WhatsApp traz o metadado de anúncio autenticado pelo provedor (`referencia_anuncio.fonte = metadado_whatsapp`) e esse ID de anúncio aparece no CSV Meta com **exatamente uma** `campanha_id`, vinculada a um código ativo, o lead **sem código** recebe esse código com origem `anuncio_meta`. Nunca sobrescreve escolha manual; ambiguidade deixa o lead sem código. Falhas não interrompem a ingestão.
- *Histórico*: administração/gestão podem acionar “Aplicar aos leads antigos”, que preenche apenas leads sem código cujos eventos com anúncio autenticado resolvem para um único código.
- Toda mudança entra no histórico do lead pelo trigger de auditoria existente (sistema ou ator), exibida como “Código de campanha” e “Origem do código”.

**Pedidos** herdam o código do lead pelo `lead_id` exato. Totais de pedidos continuam fora de `mimo_leads.valor_pedido`/`conversao_em`.

### Indicadores por código

- Investimento = investimento Meta das campanhas vinculadas pelo ID (linhas Meta inteiras no período, mesma regra de sobreposição do bloco Meta) + investimentos manuais não anulados com competência no período.
- Leads CRM = leads da coorte com o código; mostra quantos vieram automaticamente pelo anúncio.
- Custo por lead = investimento ÷ leads CRM do código.
- Pedidos = pedidos da coorte desses leads (confirmado/faturado/enviado/entregue, primeira confirmação no período). Faturamento soma faturado/enviado/entregue.
- CAC = investimento ÷ pedidos; Retorno (ROAS) = faturamento ÷ investimento.
- **Não atribuídos**: leads, pedidos e faturamento da coorte sem código, e o investimento Meta de campanhas sem código.

Investimento Meta vinculado fica indisponível quando: o banco ainda não tem os IDs Meta (`mimo-retorno-campanhas-ids-meta.sql` não aplicado), há linhas sobrepostas da mesma campanha ou valor ausente. Código só com investimento manual continua calculado. Antes da migração de códigos a seção mostra “ainda não ativados” e o restante do dashboard continua igual.

## Bloco Meta por campanha

Mostra investimento, leads Meta e CPL Meta por campanha importada. Quando o CSV traz IDs (campanha/anúncio) e o banco tem a migração de IDs, leads CRM são atribuídos à campanha pelo ID exato do anúncio do contato autenticado do WhatsApp, e pedidos pelo `lead_id`. Sem IDs, leads CRM, pedidos, receita, CAC e ROAS por campanha ficam indisponíveis. O bloco **Não atribuídos** mostra a captação e os pedidos sem vínculo exato.

## Período, contagens e unidades

O período, de até um ano, usa datas comerciais de São Paulo. A coorte inclui leads que entraram nele; pedidos da coorte exigem `lead_id` exatamente igual e primeira confirmação dentro do mesmo intervalo. Contam estados atuais confirmado/faturado/enviado/entregue; cancelados/rascunhos não contam. Receita faturada soma apenas os estados faturado/enviado/entregue. São valores atuais dos pedidos, não recebimentos, lucro nem receita causada pela mídia.

Pedidos do período sem lead na coorte aparecem separadamente, com quantidade e receita próprias, sem entrar no total da coorte nem de um código. Valores legados `mimo_leads.valor_pedido`/`conversao_em` não são lidos nem somados.

Cada pedido e lead é contado uma vez pelo ID. Meta é deduplicado por ID e validado contra a chave única da importação; snapshots conflitantes são recusados. As consultas paginam até o total exato e rejeitam consulta incompleta, mudança na contagem ou mais de 20 mil registros, pedindo redução do período.

Somente linhas Meta inteiramente dentro do período entram no cálculo. Períodos parciais são avisados e excluídos. Linhas do mesmo anúncio com períodos sobrepostos, ou linhas agregadas sobrepostas a detalhes, tornam o total da campanha indisponível para evitar soma duplicada.

Investimento Meta em reais é convertido para centavos inteiros antes da soma; investimento manual e pedidos já estão em centavos. `CPL Meta = investimento / leads Meta`, apenas com dados completos e denominador positivo; zero conhecido é exibido como zero, dado ausente como “—”. Leads Meta nunca aumentam o número de leads CRM.

## Migrações preparadas (não aplicadas)

Aplicar com backup verificado, pela ferramenta de migração, nesta ordem:

1. `docs/migracoes-preparadas/mimo-retorno-campanhas-ids-meta.sql` — colunas `campanha_id/conjunto_id/anuncio_id` em `mimo_meta_ads_metricas` e importação com IDs.
2. `docs/migracoes-preparadas/mimo-campanhas-codigo.sql` — cadastro de códigos, vínculos Meta, investimento manual, histórico, colunas `campanha_codigo_id/campanha_codigo_origem` em `mimo_leads`, trigger de captura automática e RPCs.

Depois de aplicar: reimportar o CSV Meta com as colunas “ID da campanha” e “ID do anúncio”, cadastrar os códigos com os IDs de campanha e, se desejado, acionar “Aplicar aos leads antigos”. O código antes da migração continua funcionando (leituras toleram a ausência das tabelas/colunas).

## Verificação

`node node_modules/vitest/vitest.mjs run --config vitest.mimo-retorno.config.ts --configLoader runner`

Fixtures sintéticas cobrem vínculo exato pedido→lead→código, nomes iguais sem atribuição presumida, investimento Meta por ID + manual, anulação/competência, empresa/cargo (marketing indisponível, não zero), não atribuídos, duplicações, sobreposições, esquema sem IDs/sem migração, limites de período, paginação incompleta e interface. Sem chamada ou escrita externa.
