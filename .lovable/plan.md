# Tira-pedido MiMo — planejamento para aprovação

## 1. Escopo e diagnóstico

**Somente planejamento. Cada etapa futura exige autorização independente. Aprovar este relatório não autoriza executar todas as etapas.**

A inspeção do código confirma área MiMo privada, empresa fixa, membros ativos, papéis administrador/gestor/vendedor, CRM próprio, histórico, equipe, auditoria administrativa, importação manual de métricas Meta, dashboard e relatórios CSV. Vendedores acessam somente leads atribuídos a si; gestores e administradores têm acesso ampliado. O Tira-pedido deve ampliar essa área, sem criar outro CRM, autenticação ou empresa.

Hoje `valor_pedido` e `conversao_em` pertencem ao lead: isso não representa vários pedidos, itens, pagamentos ou expedições. Dashboard e relatórios usam a coorte de leads que entraram no período, não o conjunto de pedidos confirmados no período. É o principal conflito de modelo a resolver.

Não foi encontrada dependência específica de geração de PDF no manifesto inspecionado. Não se considera geração de PDF existente. A preparação WhatsApp depende de vínculo comercial explicitamente confirmado; nenhuma conexão é presumida ativa.

**Limite das evidências:** esta análise foi de arquivos, não uma auditoria do banco em execução. Não executei testes, consultas ao banco ou navegação visual. Não há logs de validação disponíveis nesta sessão. Números históricos de testes não comprovam a situação atual. O documento afirma que a aplicação não foi publicada; o contexto registra endereço publicado do ZapScout, mas não comprova qual versão da MiMo está nele. A Etapa 0 verificará essa diferença sem publicar.

## 2. Recursos reutilizáveis e fluxo de telas

Reutilizar empresa/membros, autorização por papel e lead, cadastro e busca de duplicados, reatribuição administrativa, padrões de componentes, layout MiMo, concorrência otimista e cálculos puros testáveis. Preservar relatórios atuais e neutralização de fórmulas em CSV. Auditoria de pedidos será própria, sem substituir histórico do CRM ou auditoria de membros.

Novo menu **Tira-pedido**, apenas na MiMo: lista de pedidos → selecionar/cadastrar cliente autorizado → produtos/modelo PDV → negociação e pagamento → distribuição em caixas → cotação manual → revisão/proposta → acompanhamento. Rascunhos podem ter pendências, exibidas sem apresentar totais/cotações incompletos como definitivos. Dentro do módulo: catálogo, modelos e configuração comercial, com acesso conforme matriz abaixo.

### Identidade visual do Tira-pedido

Referências: site oficial https://mimoessepode.com.br e catálogo de produtos fornecido pelo usuário. Fundo creme/off-white, laranja MiMo como destaque principal, marrom escuro nos títulos e verde suave, amarelo e coral como auxiliares. Cartões claros com bordas arredondadas, layout limpo e profissional, elementos orgânicos e lúdicos moderados. Integrar ao ZapScout com identidade restrita ao Tira-pedido MiMo, sem interferir nos demais templates ou modificar o CRM existente.

Aplicar a identidade mais completa nos PDFs comerciais, preservando legibilidade. Utilizar logo oficial sem alterações e fotos/embalagens originais, sem recriações ou mudanças no design. As cores extraídas do catálogo são aproximadas, não tokens oficiais; definir tokens locais somente após conferir os materiais oficiais. O site e o catálogo não foram inspecionados nesta atualização: não presumir ativos disponíveis nem cores exatas.

## 3. Regras comerciais e cálculos

- Catálogo inicial: três barrinhas em display de 15, R$ 59,85 cada; bolos Chocolate/Laranja/Cenoura/Milho R$ 10,39 e Rose Velvet R$ 18,58; panquecas Cenoura/Beterraba/Espinafre/Cacau R$ 11,99. Misturinhas por embalagem individual de 300 g. Quantidades inteiras mínimas de 1 por sabor incluído; zero remove o item. Sem mínimo total ou múltiplos obrigatórios de misturinhas; sem estoque.
- Manter identidade única dos produtos, desativação sem exclusão e preços versionados. Validar somente a aba TABELA da planilha quando recebida; preço de caixa não substitui o preço de venda acordado.
- Ampliação futura: segundo o complemento, o material identifica 29 produtos em sete famílias. Manter os 12 aprovados como catálogo comercial inicial e preparar cadastro para outros 17: quatro macarrões instantâneos, três Meu Primeiro Bolinho, três snacks, três temperinhos e quatro geleias. Usar códigos oficiais do catálogo; não inventar códigos, preços B2B, disponibilidade, peso de transporte, unidades comerciais, capacidade por caixa ou alegações nutricionais por produto. Itens adicionais permanecem indisponíveis para inclusão comercial até confirmar os dados essenciais. Preços de varejo do site nunca substituem preços B2B.
- Modelos Compacto/Inicial/Completo: todas as 12 quantidades do documento, copiadas ao pedido sem alterar o modelo. Conferência matemática independente confirmou R$ 491,47 / R$ 968,75 / R$ 1.558,24; 5/10/16 displays; 16/30/50 misturinhas; 7,05/13,50/22,20 kg. Isso não é teste do aplicativo. Atualizações de preços geram novas referências, não reescrevem pedidos.
- Negociação livre pelo vendedor autorizado, sem aprovação comercial. Registrar preço original e negociado. Preço negociado é a base do item; desconto individual incide uma vez sobre essa base; desconto geral incide depois, somente sobre produtos elegíveis já descontados. Mudanças preservam trilha explícita para evitar reaplicar desconto embutido. Percentual ou valor fixo, nunca negativo ou acima da base elegível.
- Bonificações: linhas físicas com venda zero; displays, misturinhas ou brindes de catálogo/manuais. Custo interno opcional separado da proposta. Brindes continuam na distribuição e no peso; não equivalem a itens inexistentes.
- Caixa P: 23×16×17 cm, 4 displays OU 10 misturinhas; G: 24×24×18 cm, 8 displays OU 16 misturinhas. Única mistura comprovada: P com 2 displays e 6 misturinhas. Display = 450 g e 15 barrinhas; misturinha = 300 g. Sem tara inventada, fator de cubagem presumido ou capacidade mista calculada por proporção.
- Sugerir menos caixas, sem prometer ótimo físico em combinações desconhecidas. Permitir mover itens, mudar/adicionar/remover volumes e validar combinações. Distribuição exige confirmação manual antes da cotação; soma alocada deve igualar quantidades físicas do pedido. Alterações posteriores invalidam a confirmação e tornam cotação anterior desatualizada. Peso ajustado manual, com autoria, resolve brindes sem peso; dimensões/encaixe também precisam estar resolvidos.
- Jadlog manual: origem 96085-440, destino do pedido, dados copiáveis por volume, valor oficial, modalidade/prazo quando informados, data, condições e validade conhecida. Modo exclusivo: total da remessa OU soma de cotações por volume. Nunca somar ambos. Destacar a menor opção comparável, sem seleção automática. Cotação não é etiqueta, contratação ou expedição. Valor declarado provisório antes da nota; valor fiscal confirmado para envio.
- Frete: escolha obrigatória, sem padrão, integralmente cliente OU MiMo, sem divisão. Cliente: somar ao valor cobrado; MiMo: registrar custo interno sem aumentar cobrança. Cotação e custo efetivo são distintos.
- PIX: antecipado, confirmação manual com autor/data/hora; bloqueio no servidor e banco para faturar ou enviar sem confirmação vigente. Desfazer confirmação após faturamento/envio exige tratamento auditado, não criar estado contraditório.
- Boleto: parcela única ou parcelas iguais, diferença de centavos distribuída mantendo a soma exata; prazos escolhidos entre 14/21/28/35/42 dias a partir do faturamento/nota. Antes da data-base, mostrar prazos previstos, não vencimentos definitivos.
- Cartão: 1–12 parcelas; 3,13% em 1x; 3,68% em 2–6x; 5,89% em 7–12x. Em centavos inteiros e taxa em pontos-base: produtos brutos = teto(produtos líquidos × 10.000 / (10.000 − taxa)). Validar preservação do líquido com arredondamento da tarifa; repartir parcelas sem mudar o total. Somar frete do cliente depois. Tarifa real incide na transação inteira; mostrar líquido e diferença absorvida pela MiMo (inclui tarifa do frete), sem prometer líquido integral. Guardar taxa aplicada, nunca recalcular passado.
- Estados operacionais: rascunho, aguardando pagamento, confirmado, faturado, enviado, entregue, cancelado. Separar situação financeira e operacional; justificativas, autoria e histórico. Não presumir boleto recebido porque pedido foi confirmado. Cancelamento/reabertura não apaga eventos ou pagamentos.
- Propostas versionadas: logo oficial, cliente, itens, brindes, descontos, frete, condições, observações e versão. PDF e WhatsApp sem custos internos/margens/administração. Copiar/abrir WhatsApp apenas por ação humana, sem envio automático ou UazAPI.

## 4. Arquitetura técnica e dados propostos

Nomes provisórios, todos em `public`, com UUID e `empresa_id`. Tabelas somente necessárias, agrupadas por domínio:

| Domínio | Estruturas propostas e relações |
|---|---|
| Catálogo | `mimo_produtos`, `mimo_produto_precos`: identidade/SKU único na empresa, unidade, peso, ativo, versões imutáveis de preço/vigência |
| Modelos | `mimo_pdv_modelos`, `mimo_pdv_modelo_itens`: versões/quantidades por produto; PDV é modelo de sugestão, não cadastro paralelo de cliente |
| Pedido | `mimo_pedidos`, `mimo_pedido_itens`: vínculo obrigatório com `mimo_leads`, revisão, dados comerciais/destino congelados, itens produto/bonificação/brinde externo; referência e cópia dos preços aplicados |
| Logística | `mimo_caixa_tipos`, `mimo_caixa_combinacoes`, `mimo_pedido_volumes`, `mimo_volume_itens`: padrões versionados, combinações comprovadas, quantidade de cada linha por volume e confirmação da revisão |
| Frete | `mimo_frete_cotacoes`, `mimo_frete_cotacao_volumes`: alternativas/histórico, modo remessa/volume, revisão logística, origem manual/API; seleção explícita no pedido |
| Financeiro | `mimo_taxas_cartao`, `mimo_pedido_pagamentos`, `mimo_pedido_parcelas`: versões de taxa, condições aplicadas, confirmação/reversão, data-base e vencimentos; sem dados de cartão |
| Histórico | `mimo_pedido_versoes`, `mimo_pedido_eventos`, `mimo_propostas`: versões imutáveis, autoria, mudanças e proposta vinculada à revisão; PDF privado se persistido |

Integridade: chaves compostas `(empresa_id,id)` e referências compostas impedem ligar pedido/lead/produto/volume de empresas diferentes. Restrições de quantidade inteira positiva, valores não negativos, taxa válida, unicidade de versão/SKU e modos exclusivos. Rate limits, validação de tamanho e Zod no servidor. Atualização transacional com revisão esperada impede sobrescrita concorrente; criação/confirmar/cancelar com chave idempotente impede duplicação por clique/retry. Alocação, totais, bloqueios PIX e histórico também validados no banco, não só na tela.

Índices: empresa+data+id, empresa+lead, responsável/status, filhos por pedido, produto+versão/vigência e eventos por pedido/data. Não usar nomes como única identidade de produto. Nenhum vínculo novo com tabelas gerenciadas de autenticação; preservar estruturas atuais.

RLS e GRANT explícitos: admin/gestor todos os pedidos da empresa; vendedor somente pedidos de leads atualmente atribuídos a si. A mesma regra alcança itens, pagamentos, volumes, propostas e eventos. Autor histórico não concede acesso após reatribuição; reutilizar a regra do lead para acompanhar transferências. Catálogo/modelos compartilhados entre membros ativos; gestão do catálogo/taxas por admin/gestor como proposta a validar, sem limitar negociação do vendedor. Custos internos retornados somente quando necessários à operação; projeção para cliente nunca os inclui.

Funções internas autenticadas em `createServerFn`, cliente com permissões do usuário; não usar acesso privilegiado para leituras comuns. RPCs críticas verificam empresa/papel/IDs e têm execução restrita e `search_path` fixo. Eventos sem edição/exclusão, gravados atomicamente. APIs futuras exclusivamente no servidor, segredos fora de cliente, tabelas acessíveis e logs. PDFs privados com autorização a cada acesso, sem links públicos permanentes.

Arquivos futuros: novas rotas MiMo de Tira-pedido/catálogo/modelos; módulos `mimo-pedidos*`, `mimo-catalogo*`, `mimo-logistica*`, `mimo-financeiro*`, `mimo-propostas*`; componentes pequenos; migrações aditivas e testes por domínio. Alterar menu em `src/routes/_authenticated/mimo.tsx`. Reutilizar `mimo-acesso*`, `mimo-leads*`, `mimo-equipe.functions.ts`. Só na Etapa 7 revisar `mimo-dashboard*` e `mimo-relatorio*`. Não tocar IA, webhook pessoal, campanhas pessoais ou tabelas gerenciadas.

## 5. Indicadores e riscos de regressão

Pedidos confirmados devem contar por identidade única, não por evento ou edição. Faturado e recebido são métricas separadas. Novos clientes contam clientes distintos na primeira confirmação válida; cancelamentos/reversões recalculam a projeção sem apagar histórico. Retenção da data/evento original e regras explícitas de período evitam deslocamento por reabertura.

Preservar coorte de aquisição atual; adicionar métricas de pedidos em separado. Não somar `mimo_leads.valor_pedido` e totais dos novos pedidos. Antes de integração dos indicadores, inventariar fechamentos antigos e aprovar mapeamento sem criar pedidos fictícios ou migrar automaticamente. Histórico comercial já existente permanece intacto.

Riscos principais: acesso a pedido do colega por tabela filha/PDF, ligação entre empresas, alterações concorrentes, desconto/taxa aplicada duas vezes, cotação desatualizada, caixa inviável, PIX bloqueado só visualmente e receita duplicada. Todos exigem testes negativos e controles no banco/servidor.

## 6. Plano incremental e aceite

**Regra comum:** aprovação específica antes de cada etapa; evidências e pendências ao concluir; nunca prosseguir automaticamente. Mudanças futuras aditivas, sem exclusões/cópias de dados pessoais; reversão por desativar acesso ao novo módulo e manter histórico. Testes de banco em transações revertidas ou ambiente isolado autorizado, nunca dados fictícios persistentes no banco compartilhado.

| Etapa | Objetivo, impacto e dependências | Testes e aceite objetivo; preservação/reversão |
|---|---|---|
| 0 — Verificações atuais | Auditar telas, permissões reais, testes disponíveis, versão publicada e documentação; arquivos atuais somente se correção aprovada | Admin/gestor/vendedor/externo/visitante, isolamento, reatribuição, banco direto, fluxos visuais e compilação; evidências atuais, nenhum risco crítico aberto. Sem implantação; sessões ausentes identificadas como bloqueio |
| 1 — Dados e catálogo | Novas migrações, catálogo/preços e base do pedido; depende da Etapa 0 e validação TABELA; prever famílias e códigos oficiais dos 17 produtos adicionais sem liberá-los para venda | 12 produtos/preços, mínimos, histórico, desativação, unicidade, FKs e RLS negativos; vendedor não administra preço-base; produtos adicionais sem dados essenciais confirmados não entram em pedidos; varejo não substitui B2B. Desligar telas, preservar versões |
| 2 — PDV e montagem | Modelos e pedidos/itens vinculados ao CRM; rotas/componentes novos | Três referências exatas, display→15 unidades, editar pedido não muda modelo, duplicados sem revelar colega, concorrência; salvar e reler rascunho. Sem pedidos históricos artificiais |
| 3 — Negociação/financeiro | Brindes, descontos, taxas, pagamentos/parcelas | Descontos sucessivos, limites, venda zero com quantidade física, centavos e soma das parcelas, todas faixas cartão, frete, bloqueio PIX no banco; sem integrações financeiras |
| 4 — Caixas | Tipos, combinações, volumes/alocações | P/G homogêneas, P 2+6, mistura desconhecida sinalizada, confirmação, pesos/ajuste, mover/remover sem perda/duplicação; alterações invalidam confirmação. Manter histórico |
| 5 — Jadlog manual | Cotações/remessa/volumes; depende de distribuição confirmada | Origem/destino, dados completos, seleção humana, remessa OU soma, validade e desatualização; valor provisório identificado, histórico relido. Nenhuma API/etiqueta |
| 6 — Propostas | PDF/WhatsApp, versões e eventual armazenamento privado; depende dos ativos oficiais | Conferir totais e versão; custos internos ausentes, acesso negado ao colega/externo, textos escapados; download/cópia/abertura sem envio automático. Dependência PDF só após revisão |
| 7 — Ciclo/CRM/indicadores | Completar acompanhamento e projeções; revisar dashboard/relatórios sob mapeamento aprovado | Sete estados, pagamentos, nota/data-base, PIX, cancelamento/reabertura, um pedido não contado duas vezes, clientes distintos, confirmado≠faturado≠recebido; comparação com relatórios antigos. Manter indicadores antigos recuperáveis |
| 8 — Validação final | Segurança, documentação, integração e telas em tamanhos variados | Fluxo real completo como papéis autorizados, banco direto, isolamento, PDFs/CSV, compilação e regressões ZapScout; evidências sem falhas críticas. Publicação exige autorização distinta |
| 9 — Jadlog API | Adaptador servidor, somente com token/contrato/documentação e autorização própria | Revalidar endpoint Embarcador, modalidades, multivolumes, cubagem, prazo, erros/retry, segredos e validade; comparar cotações oficiais. Retorno ao manual, sem contratar transporte implicitamente |

## 7. Dependências e questões bloqueantes

Não impedem aprovar o planejamento; bloqueiam somente a etapa correspondente:

1. Etapa 0: contas/sessões autorizadas para validação real de gestor/vendedor e comprovação da versão atual. Não considerar simulação equivalente a fluxo real.
2. Etapa 1: receber `Tira_Pedido_Empório.xlsx` e validar aba TABELA sem importar outras abas; confirmar quem administra catálogo/taxas e modelos compartilhados.
3. Etapa 3: definir seleção dos prazos e quantidade máxima de parcelas do boleto; documentar arredondamento efetivo da operadora e confirmação financeira do cartão sem integração.
4. Etapa 4: comprovação de outras misturas e dados logísticos de brindes quando utilizados; até lá, confirmação humana sem garantia automática de encaixe.
5. Etapa 6: logo/ativos oficiais e dados comerciais que constarão na proposta; conferir o site e o catálogo para identidade aproximada, sem recriar fotos ou embalagens. Ampliação comercial dos 17 produtos: catálogo com códigos oficiais e confirmação dos dados essenciais de cada item; a ausência desses dados não impede lançar somente os 12 produtos iniciais aprovados.
6. Etapa 7: aprovar transições/reversões e mapeamento de fechamentos antigos para indicadores, sem duplicação ou apagamento.
7. Etapa 9: token Jadlog, contrato, documentação vigente, modalidades, suporte multivolumes, cubagem e peso de cobrança. Endpoint informado é referência, não integração validada. Faturamento e UazAPI continuam apenas pontos futuros de extensão.

## 8. Confirmação de não execução

**Nenhum código, componente, rota, configuração, tabela, política, dado, permissão ou dependência foi alterado. Nenhum token foi criado/utilizado; nenhuma API conectada, migração executada ou publicação realizada.** Apenas este relatório de planejamento foi salvo para revisão. Aguardar autorização explícita para a etapa escolhida.