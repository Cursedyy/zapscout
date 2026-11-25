# Rastreamento de entregas MiMo

## Fontes canônicas auditadas

A tela `/mimo/rastreamento` usa exclusivamente `mimo_tira_pedidos_seguros`, com o cliente autenticado e filtro obrigatório por `empresa_id`. O pedido fornece número, cliente, estado e datas. A cotação selecionada em `documento.cotacaoId` fornece, quando persistidos, transportadora, modalidade, prazo, código do serviço e dados de postagem.

Não existe hoje código de rastreio, evento de trânsito, etiqueta ou confirmação externa de entrega no schema do pedido, na sincronização Nuvemshop nem nas integrações de cotação Jadlog/Frenet. A documentação da Frenet já registra que essa integração não contrata frete nem oferece rastreamento. Por isso a tela identifica `servicoCodigo` como **código do serviço**, exibe a ausência desses dados sem completar valores e não chama nenhuma API externa.

## Escopo e autorização

- Administrador, gestor, administrativo e vendedor ativos veem a entrada de menu. Marketing permanece sem acesso a pedidos.
- A função de servidor revalida associação ativa e empresa em cada chamada. A leitura usa a visão segura existente, preservando também o recorte por responsável aplicado ao vendedor no banco.
- Apenas pedidos nos estados canônicos `faturado`, `enviado` e `entregue` compõem a tela. Os rótulos “Preparando envio”, “Enviado” e “Entregue” são apresentações diretas desses estados; não representam eventos externos.
- Busca por código consulta somente `servicoCodigo` da cotação selecionada. Não é busca por código de rastreio.

## Integração e limites

Não há migração, variável de ambiente, credencial, webhook ou dependência nova. A integração futura com rastreamento depende de uma fonte contratada e verificada, de um identificador canônico de remessa/código de rastreio e de eventos company-scoped protegidos por RLS. Até isso existir, a tela deve continuar sem links ou previsões inventadas.

A consulta pagina a visão segura em lotes e recusa mais de 20 mil pedidos no recorte, solicitando um período menor. Busca, status, período e paginação são validados no servidor.
