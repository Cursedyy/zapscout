# MiMo / OMIE: prévia de CFOP

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

Na confirmação explícita, o servidor carrega apenas uma prévia do mesmo ator/empresa, consulta novamente o pedido completo e compara o hash. A RPC bloqueia o registro, revalida a associação/papel ativos e grava a simulação ou a recusa por alteração/expiração atomicamente. Repetir uma confirmação concluída retorna o resultado já registrado sem novo evento. O navegador não pode gravar diretamente nas tabelas nem executar as RPCs; só o servidor pode invocá-las, usando identidade obtida pelo middleware autenticado. A auditoria é legível somente pela gestão MiMo; prévias são legíveis somente pelo próprio gestor/administrador.

## Limites de escrita e validação externa

O único método remoto invocado é `ConsultarPedido` (POST de leitura na API oficial), com prazo de 15 segundos e redirects recusados. Não há chamada a `AlterarPedidoVenda`, simulação de impostos, emissão, cancelamento ou escrita real. Não há retentativas automáticas do adaptador.

A [documentação oficial de Pedidos de Venda](https://app.omie.com.br/api/v1/produtos/pedido/) informa que o retorno `pedido_venda_produto` contém campos exclusivos de consulta, como `ide.id_ordem_producao`, `imposto.icms_efet` e `numero_pedido`. Portanto, **a cópia completa preservada para simulação não é um payload de alteração homologado**. O contrato de envio, possíveis recálculos do provedor e conflitos entre edições externas precisam de validação específica antes de qualquer habilitação futura. Um teste de igualdade local não prova o resultado remoto.

Uma etapa futura de escrita exigirá autorização, ambiente/pedido de teste, mapeamento dos campos aceitos sem perda fiscal, reserva durável antes do envio, tratamento de respostas ambíguas sem repetição automática e leitura posterior para conferência. Nada disso deve ser ativado apenas trocando uma variável desta versão.

## Verificações locais

Fixtures exclusivamente sintéticas; rede OMIE mockada. A suíte cobre igualdade profunda de todos os campos exceto CFOP, IDs/seleções inválidas, papéis, vínculo com empresa, respostas e erros seguros, consulta prévia/confirmatória, invalidação por mudança, expiração, repetição, RLS/RPC e auditoria imutável em PGlite, além do fluxo de confirmação na interface.

Comando: `npx vitest run --config vitest.mimo-omie.config.ts --configLoader runner`.
