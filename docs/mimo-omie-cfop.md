# MiMo / OMIE: prévia de CFOP

## Envio do Tira Pedido para conferência

No painel de pedidos, **Enviar ao Omie** consulta os produtos dos pedidos confirmados. O servidor resolve o código exato no catálogo Omie e usa o ID interno ao montar o pedido. Produtos inativos, sem resultado ou ambíguos ficam pendentes. Quando o código visual difere, o administrador pode configurar `MIMO_OMIE_VINCULOS_PRODUTOS`, um objeto JSON privado que relaciona o código do catálogo MiMo ao ID do produto homologado no Omie. O vínculo é reconsultado a cada envio. Isso também permite vincular códigos de brindes para conferência, embora os pedidos com brindes ainda não sejam elegíveis para envio.

Administrador, gestor ou administrativo conferem os produtos, identificam um cliente ativo por CPF ou CNPJ e informam os dados de venda exigidos pelo Omie. O botão inclui um pedido na etapa inicial, com o código de integração `MIMO-<número>`. O financeiro confere os dados, endereço e regras fiscais e fatura no Omie. Pedidos com desconto geral, acréscimo de cartão ou brinde continuam no fluxo manual enquanto suas regras estiverem pendentes de homologação.

Para habilitar o envio, verificar o backup, aplicar `mimo-omie-envio-pedido.sql` pelo migrador oficial e homologar a criação e leitura de volta em um aplicativo de teste, com a etapa 10 ativa e os cadastros aprovados. A configuração server-side `MIMO_OMIE_ENVIO_PEDIDO=ativo` habilita o envio quando `MIMO_TIRA_PERSISTENCIA=ativa`. A área de CFOP continua em modo de simulação.

O banco reserva um único envio por pedido, vincula a reserva à versão, aplicação e hash e registra quem solicitou o envio. A confirmação remota confere cliente, itens e total. Se o resultado ficar incerto, a mesma operação passa a consultar o código de integração no Omie. Se a consulta localizar uma divergência ou não localizar o pedido, é preciso verificar o pedido e a reserva antes de outra tentativa de criação.

## Emissão e autorização da NF-e

O painel usa o vínculo do pedido confirmado com o Omie. Depois que o financeiro confere o pedido no Omie, a emissão pelo painel confere novamente cliente, itens, valores e frete, exige CFOP e bloco de impostos e chama `ValidarPedidoVenda`. O banco reserva uma única chamada de emissão por pedido e impede alterações concorrentes até a conciliação. Em caso de dúvida sobre o retorno, a ação seguinte consulta o resultado, sem reenviar a solicitação.

O painel registra o número, a chave de acesso e a data da NF-e e usa a transição existente para marcar o pedido como faturado somente após confirmar uma nota de saída autorizada no ambiente de produção e vinculada ao mesmo pedido. A autorização pode ser consultada também quando o financeiro concluir o pedido diretamente no Omie. Casos com múltiplas notas, cancelamento, denegação ou retorno divergente ficam para conferência no Omie.

Antes de ativar, aplicar `mimo-omie-envio-pedido.sql` e `mimo-omie-faturamento-producao.sql`, nessa ordem, pelo migrador oficial após verificação do backup. Homologar o envio com embalagens reais e conferir no Omie de teste a NF-e do pedido piloto. Confirmar a empresa, os cadastros fiscais e os retornos de `StatusPedido` e `ListarEtapasPedido` antes de habilitar `MIMO_OMIE_ENVIO_PEDIDO=ativo` e `MIMO_OMIE_FATURAMENTO=ativo` no servidor. Se a emissão ficar incerta, fiscal e operações devem reconciliar o pedido antes de realizar correções. Desativar a chave de faturamento impede novas solicitações e a consulta continua disponível enquanto o envio estiver ativo.

## Escopo entregue

O fluxo fiscal relatado em #6 pertence ao OMIE, um SaaS externo. Não foi identificada nem corrigida a causa interna da perda de alíquota no OMIE. Conforme a autorização posterior, esta entrega adiciona uma integração **somente de consulta e simulação**, em `/mimo/omie`, acessível a administrador/gestor ativos da empresa fixa MiMo. #2 (indicador de feedback) e #8 (filtro de seguidores) permanecem no mesmo worktree.

O usuário informa o código interno do pedido (`codigo_pedido`, diferente do número comercial) e os CFOPs aprovados pela contabilidade. O servidor consulta o documento completo, valida os IDs dos itens e cria uma cópia alterando apenas `det[n].produto.cfop`. Não calcula impostos, escolhe códigos, preenche dados ausentes nem remove campos desconhecidos. Pedidos faturados/cancelados, itens duplicados e operações de exclusão são recusados. Bloco fiscal ausente é erro, não um objeto vazio presumido.

A tela exibe somente identificação do pedido, descrição/ID dos itens e CFOP. Credenciais, documento fiscal completo e blocos de impostos nunca são retornados ao navegador ou gravados nos logs da integração.

## Configuração e ativação da simulação

Variáveis exclusivamente no servidor:

- `OMIE_APP_KEY` e `OMIE_APP_SECRET`: credenciais do aplicativo OMIE da MiMo.
- `MIMO_OMIE_EMPRESA_ID`: UUID da empresa MiMo à qual essas credenciais pertencem. A administração deve conferir o vínculo do aplicativo antes de configurar; não há inferência pelo nome.
- `MIMO_OMIE_MODO=simulacao`: único modo aceito nesta versão; ausência também significa simulação. Qualquer outro valor torna a integração indisponível. **Não existe chave que habilite escrita nesta entrega.**

Sem credenciais/vínculo válido, a tela informa indisponibilidade de configuração. A auditoria precisa da migração preparada `docs/migracoes-preparadas/mimo-omie-cfop-simulacao.sql`, que **não foi aplicada**. Usar o migrador oficial somente após autorização e verificação do backup; não executar SQL avulso no banco compartilhado. Sem as tabelas, a tela também fica indisponível.

## Prévia e auditoria

Cada prévia possui ID gerado no banco, ator verificado, empresa, pedido, hash do documento/aplicativo/empresa, diferenças mínimas dos CFOPs e expiração em dez minutos. O banco registra eventos append-only: `previa`, `simulada`, `obsoleta` ou `expirada`. Não armazena o documento fiscal completo nem credenciais.

A criação usa uma chave idempotente derivada da versão integral e do diff normalizado, com unicidade por empresa, ator e pedido. Reenvios e disputas concorrentes retornam a mesma prévia e não duplicam eventos. A criação da prévia e do primeiro evento ocorre na mesma transação; qualquer falha desfaz ambos (rollback lógico). A confirmação também é serializada por bloqueio de linha e repetições retornam o estado terminal já gravado.

Na confirmação explícita, o servidor carrega apenas uma prévia do mesmo ator/empresa, consulta novamente o pedido completo e compara o hash. A RPC bloqueia o registro, revalida a associação/papel ativos e grava a simulação ou a recusa por alteração/expiração atomicamente. Repetir uma confirmação concluída retorna o resultado já registrado sem novo evento. O navegador não pode gravar diretamente nas tabelas nem executar as RPCs; só o servidor pode invocá-las, usando identidade obtida pelo middleware autenticado. A auditoria é legível somente pela gestão MiMo; prévias são legíveis somente pelo próprio gestor/administrador.

## Limites de escrita e validação externa

O único método remoto invocado é `ConsultarPedido` (POST de leitura na API oficial), com prazo de 15 segundos e redirects recusados. Não há chamada a `AlterarPedidoVenda`, simulação de impostos, emissão, cancelamento ou escrita real. Não há retentativas automáticas do adaptador.

A [documentação oficial de Pedidos de Venda](https://app.omie.com.br/api/v1/produtos/pedido/) informa que o retorno `pedido_venda_produto` contém campos exclusivos de consulta, como `ide.id_ordem_producao`, `imposto.icms_efet` e `numero_pedido`. Portanto, **a cópia completa preservada para simulação não é um payload de alteração homologado**. O contrato de envio, possíveis recálculos do provedor e conflitos entre edições externas precisam de validação específica antes de qualquer habilitação futura. Um teste de igualdade local não prova o resultado remoto.

Uma etapa futura de escrita exigirá autorização, ambiente/pedido de teste, mapeamento dos campos aceitos sem perda fiscal, reserva durável antes do envio, tratamento de respostas ambíguas sem repetição automática e leitura posterior para conferência. Nada disso deve ser ativado apenas trocando uma variável desta versão.

## Critérios de homologação e ativação futura

Esta entrega pode homologar apenas **consulta e simulação** quando: a migração preparada tiver revisão e backup verificado; o aplicativo OMIE estiver vinculado ao UUID fixo da MiMo; administrador/gestor conseguirem consultar e demais papéis forem negados; fixtures confirmarem preservação byte lógica de ICMS e de todos os campos dos itens fora de `produto.cfop`; reenvio/concorrência produzirem um único ID/evento; mudança externa, expiração e falha de banco não produzirem sucesso falso; e regressões, TypeScript, lint, build, audit e diff-check estiverem aprovados.

A escrita real permanece **não homologada e tecnicamente indisponível**. Para ativá-la em outra entrega serão obrigatórios: aprovação fiscal e de segurança; contrato oficial de `AlterarPedidoVenda` validado em tenant/pedidos descartáveis sem dados reais; lista exata de campos aceitos e prova de que ICMS/dados de itens não são apagados nem recalculados indevidamente; feature flag server-side separada com padrão desligado e kill switch; reserva idempotente durável antes da chamada; estados explícitos para aceite certo, rejeição e resultado ambíguo sem retry automático; leitura posterior e reconciliação; trilha de auditoria; plano de rollback operacional; observabilidade sem segredos; e autorização coordenada após a conclusão do #12. Não fazer deploy isolado desta integração.

## Verificações locais

Fixtures exclusivamente sintéticas; rede OMIE mockada. A suíte cobre igualdade profunda de todos os campos exceto CFOP, perda de campos fiscais/de item, IDs/seleções inválidas, papéis, vínculo com empresa, respostas e erros seguros, consulta prévia/confirmatória, invalidação por mudança, expiração, reenvio concorrente, colisão idempotente, rollback transacional sem resíduos, RLS/RPC e auditoria imutável em PGlite, além do fluxo de confirmação na interface.

Comando: `npx vitest run --config vitest.mimo-omie.config.ts --configLoader runner`.
