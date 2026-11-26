# Tira-pedido MiMo — brindes com envio separado

## Regra implementada no código
- Brinde externo manual tem origem comprovada por `brinde=true` e código vazio. Isso vale também para documentos antigos, sem usar nome ou ausência de peso.
- Brinde reutilizável usa `BR:<id>` e só fica separado quando seu cadastro tem `envioSeparado=true`. Cadastros antigos sem essa marca continuam na remessa principal até configuração explícita.
- Produto próprio bonificado permanece no fluxo normal; uma marca forjada em código de produto não o transforma em envio separado.
- Nome e quantidade permanecem no documento e na proposta. Pedido e logística identificam “Envio separado”, sem caixa, dimensão, peso ajustado ou confirmação física para esse item.
- Sugestão, composição, assinatura de frete, totais, preparação da remessa e validação do servidor retiram os envios separados. A mudança apenas nesses brindes não invalida a cotação dos itens principais.
- Em documentos antigos, volumes exclusivamente separados são retirados da remessa. Em volume misto, os itens comuns são preservados e o peso/confirmação são invalidados para nova conferência, pois o peso ajustado anterior pode incluir o brinde.
- Pedido somente com envios separados não exige volumes, cotação ou pagador da remessa principal; lead, CEP e endereço continuam obrigatórios para a entrega.

## Banco e ativação
`docs/migracoes-preparadas/mimo-tira-brindes-envio-separado.sql` alinha assinatura, totais, prontidão e proteção de gravação à mesma regra. O arquivo foi executado somente em PGlite isolado com dados sintéticos. Não foi aplicado ao banco real, pois esta solicitação não autorizou migração nem informou uma nova verificação de backup.

Enquanto o SQL não for aplicado pelo migrador oficial, a validação antiga do banco pode recusar a confirmação persistente de um pedido exclusivamente separado. Não publicar essa etapa sem aplicar a migração e verificar o fluxo persistente.

## Verificações
- Domínio e servidor: origem, ausência de inferência, sugestão, volumes antigos mistos, pedido exclusivamente separado, totais, cotação e remessa.
- Interface: nome/quantidade, indicação no pedido e logística, remoção de volumes antigos, ausência de controles principais no caso exclusivamente separado e opção no cadastro.
- Regressões: pedidos, preenchimento automático, segurança, geleias, Jadlog e Frenet.
- O arquivo preexistente `mimo-frete.functions.test.ts` continua sem executar corretamente neste ambiente (`TypeError: (intermediate value) is not a function` na chamada RPC simulada); o comportamento compartilhado foi coberto pelos testes de remessa e provedores.

Nenhum dado real foi alterado, nenhuma mensagem foi enviada e nada foi publicado.
