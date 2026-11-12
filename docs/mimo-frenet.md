# Frete no Tira Pedido: Frenet

## Estado

Integração publicada no Tira Pedido. O usuário criou a conta, cadastrou o token no servidor e mostrou respostas reais de cotação na interface. Correios, J&T e Jadlog aparecem ativos na Frenet; o usuário confirmou a definição do ponto J&T. Loggi e Total Express não foram configuradas. Não houve compra de etiqueta. A seleção exige origem confirmada, por configuração do servidor ou declaração explícita da gestão na própria cotação. Não há migração SQL: os dados ficam no documento versionado do pedido.

## Confirmar e selecionar no painel

Administrador ou gestor pode usar **Confirmar origem** ao lado de uma cotação Frenet pendente. Deve escolher postagem ou coleta, conferir a descrição do local e marcar que esse serviço está configurado na Frenet para o CEP de origem. O texto pode identificar o ponto padrão já definido na conta; o endereço completo pode ser acrescentado se conhecido.

**Confirmar e selecionar frete** verifica novamente papel, acesso ao cliente/pedido, dados canônicos e assinatura da cotação no servidor. Retorna uma nova cotação assinada, com o mesmo preço e vencimento, contendo o tipo/local, CEP, ator autenticado e horário da confirmação. A seleção entra no pedido em edição e deve ser salva. Isso não altera a conta Frenet nem confirma automaticamente outras transportadoras ou futuros pedidos.

Vendedor e administrativo podem selecionar uma cotação já confirmada, mas não podem confirmar a origem. A API recusa cotações adulteradas, vencidas, de outro ator/empresa/cliente ou com dados da remessa alterados. Se os dados mudarem enquanto a confirmação estiver em andamento, a interface descarta o retorno.

## Funcionamento

- Ao preencher cliente, destino, valor declarado e caixas confirmadas com peso, o Tira Pedido consulta automaticamente o servidor após uma breve pausa na edição.
- O servidor verifica a associação ativa e o papel, o acesso ao cliente/pedido e os dados oficiais do catálogo e das caixas antes da chamada externa. Vendedores continuam limitados aos clientes permitidos pelo RLS.
- A integração usa `POST https://api.frenet.com.br/shipping/quote`, com token apenas no servidor. Envia CEPs, valor declarado e medidas/peso de cada caixa; não envia nome, telefone ou custo interno.
- Cada caixa física é cotada separadamente. A nota é repartida proporcionalmente ao valor dos produtos, com distribuição exata dos centavos restantes; não é repetida integralmente em cada caixa. Consultas idênticas são reaproveitadas.
- Só aparecem combinações de transportadora e serviço que atendam todas as caixas. O comparativo soma os preços e usa o maior prazo entre as caixas. Prazo ausente permanece a confirmar.
- A opção mais barata com origem confirmada é selecionada inicialmente; a mais rápida também é identificada. O vendedor pode escolher outra opção elegível.
- Alterações nos dados invalidam o comparativo. Há botão para atualizar as cotações, limite de quatro consultas simultâneas, timeout de 45 segundos e cache do servidor por 60 segundos, isolado por empresa e credencial.
- As respostas recebem comprovante assinado, vinculado à empresa, usuário, cliente e todos os dados da cotação. Uma nova seleção exige comprovante válido por 15 minutos. Cotações já salvas permanecem como histórico imutável; uma cotação antiga antes não selecionada precisa ser renovada para ser escolhida.
- Sem a Frenet configurada, permanece a consulta Jadlog já existente. Uma falha de uma Frenet configurada é exibida e não aciona troca silenciosa de provedor. O registro de cotação manual permanece disponível.

## Ativação após criar a conta

1. Cadastrar a MiMo na Frenet com origem **96085-440, Pelotas/RS** e habilitar os serviços desejados.
2. Conferir na conta os pontos de postagem ou disponibilidade de coleta para cada serviço, incluindo a aceitação dos alimentos comercializados. Uma resposta com preço não comprova que existe base ou postagem em Pelotas.
3. Cadastrar nos segredos do servidor, sem prefixo `VITE_` e sem enviar credenciais por chat:

| Segredo                   | Conteúdo                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `MIMO_FRENET_TOKEN`       | Token da API da conta MiMo                                                                                              |
| `MIMO_FRENET_SIGNING_KEY` | Segredo aleatório para assinar cotações; na ausência, há derivação com a chave de serviço Supabase já usada no servidor |
| `MIMO_FRENET_ORIGEM_CEP`  | `96085440` (também é o padrão)                                                                                          |
| `MIMO_FRENET_POSTAGENS`   | JSON das postagens/coletas efetivamente confirmadas, conforme exemplo abaixo                                            |

Exemplo **sintético**, a substituir pelos códigos retornados pela API e pela descrição do local ou da coleta realmente confirmada:

```json
[
  {
    "transportadoraCodigo": "CODIGO_REAL_DA_TRANSPORTADORA",
    "servicoCodigo": "CODIGO_REAL_DO_SERVICO",
    "origemCep": "96085440",
    "tipo": "postagem",
    "descricao": "Substituir pelo ponto confirmado em Pelotas e suas condições"
  }
]
```

Para coleta confirmada, usar `"tipo": "coleta"`. Sem essa configuração, os preços podem ser consultados e ficam pendentes até administrador ou gestor confirmar a origem naquela cotação, pelo painel. Não há busca automática de pontos nesta versão: as APIs Whitelabel de pontos exigem credencial de parceiro, além do token de cliente.

4. Publicar o código e configurar os segredos no ambiente que executa as funções do servidor.
5. Comparar uma cotação real no Tira Pedido e na conta Frenet com exatamente os mesmos dados e serviços. Usar inicialmente quatro caixas de 4,8 kg e 24 × 24 × 18 cm, nota total de R$ 1.500 e um CEP de destino válido no Pará. Confirmar a soma de todas as caixas, os pontos de origem, as regras e o prazo antes de usar comercialmente.

## Limites do preço

A API padrão realiza pré-cotação conforme os serviços e regras da conta. O valor não é garantia do custo final de aquisição de etiqueta. Nesta versão, as caixas são tratadas como encomendas individuais e seus preços são somados; não há contratação consolidada de carga, emissão de etiquetas, coleta solicitada ou rastreamento Frenet. Contratos próprios e regras configuradas na conta podem alterar os resultados.

## Verificação local

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.frete.config.ts --configLoader runner
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/vite/bin/vite.js build --configLoader runner
```

Os testes usam respostas sintéticas, cobrindo caixas, centavos, menor preço/menor prazo, serviços parciais, falhas de API, assinatura, expiração, acesso e interface. Não substituem a conferência com a conta real.

## Referências oficiais

- [Contrato da API de cotação](https://docs.frenet.com.br/reference/calculateshippingquote)
- [Pré-cotação e pós-cotação](https://docs.frenet.com.br/docs/pre-cotacao-pos-cotacao)
- [Transportadoras e pontos de postagem](https://docs.frenet.com.br/docs/transportadoras-e-pontos-de-postagem)
