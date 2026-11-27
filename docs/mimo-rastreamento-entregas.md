# Rastreamento de entregas MiMo

Em **MiMo → Rastreamento**, abra o pedido e selecione **Ver rastreios Frenet**. Administrador, gestor e administrativo podem vincular ou editar o código da etiqueta e o código do serviço na Frenet. O serviço vem preenchido quando a cotação selecionada foi feita pela Frenet. Confira se o código corresponde ao serviço da etiqueta. Cada pedido aceita vários códigos de rastreio, por exemplo, para envios em volumes separados.

**Consultar movimentações** busca os eventos da etiqueta na Frenet e mostra descrição, data e local quando informados. A busca geral da tela continua usando número do pedido, cliente e código do serviço da cotação. Os estados comerciais do pedido e o prazo cotado continuam disponíveis na lista.

## Acesso e dados

- O fluxo se aplica a pedidos faturados, enviados ou entregues. Vendedores consultam apenas pedidos autorizados pela visão segura de pedidos. Marketing e liderança de marketing ficam fora desse fluxo.
- Os vínculos entre pedidos e etiquetas ficam em `mimo_frenet_remessas`, protegidos por RLS. O cadastro usa uma função restrita ao servidor, verifica o vínculo ativo do operador e registra o autor e o horário.
- O servidor reutiliza `MIMO_FRENET_TOKEN` e envia à Frenet somente o código do serviço e o código de rastreio. A consulta ocorre sob demanda e devolve os eventos exibidos na tela. O registro de etiquetas é manual e os eventos externos não alteram o status comercial.

## Ativação

1. Verificar o backup do banco compartilhado e aplicar `docs/migracoes-preparadas/mimo-frenet-rastreamento.sql` com a ferramenta de migração.
2. Publicar o código com `MIMO_TIRA_PERSISTENCIA` ativa e o token da MiMo em `MIMO_FRENET_TOKEN`.
3. Vincular a etiqueta de um envio já expedido, consultar as movimentações e comparar com a Frenet. Conferir a leitura como vendedor autorizado e a ausência de edição nesse perfil.

[Referência da consulta de rastreio da Frenet](https://docs.frenet.com.br/reference/trackorder)
