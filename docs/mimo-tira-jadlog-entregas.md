# Tira-pedido simplificado e Jadlog Entregas

O fluxo da MiMo usa **Jadlog Entregas**, sem contrato direto com a transportadora. A cotação automática consulta o mesmo simulador público do site; não exige token comercial, CNPJ de contrato ou parâmetros de cubagem do usuário.

## Preenchimento automático

- Escolher o modelo de PDV carrega os produtos, sugere caixas e calcula o valor provisório da mercadoria. Preços e pesos vêm do catálogo.
- Negociação de preços, descontos, bonificações, faturamento e composição manual continuam em seções expansíveis.
- Um novo pedido pode recuperar CEP e endereço do último pedido não cancelado do mesmo cliente, com verificação independente de acesso à empresa e ao lead. Trocar o cliente limpa os dados de entrega e cotações anteriores.
- A conferência de caixas/pesos permanece explícita. Não se confirma automaticamente recebimento, nota fiscal, postagem ou expedição.

## Origem da cotação

Site oficial: https://www.jadlogentregas.com.br/ . A calculadora pública funciona sem cadastro, conforme https://blog.jadlogentregas.com.br/como-enviar-produtos-pela-jadlog/ .

Em 03/11/2026, a inspeção dos arquivos públicos carregados pela própria página confirmou estas rotas anônimas, com base `https://apigwjadlogentregas.azure-api.net/`:

- `api/DescontoParamentro/BuscaTodos`: parâmetros da tabela pública.
- `api/JadLogPrazoCidaten/BuscaPorCep?cep=...`: dados de prazo do destino.
- `api/Calculadora/CalcularFrete`: simulação individual com `CalcularObjeto`, `DescontoParametro` e `PrazoCidaten`.

As três chamadas responderam sem autenticação em uma simulação sintética com CEPs públicos. Não foram usados cookies, credenciais pessoais ou a API de contratos da transportadora. A integração usa o simulador público observado; não foi encontrada documentação pública de estabilidade dessas rotas, portanto mudanças do site podem exigir manutenção do adaptador. A tela mantém o link para o site e o registro manual como alternativas explícitas em caso de indisponibilidade.

O pedido é autorizado e canonicalizado no servidor antes da consulta. Cada volume envia o peso real conferido, as medidas e sua parcela do valor declarado. A cubagem é calculada pelo próprio Jadlog Entregas. O valor total da mercadoria é rateado com centavos inteiros e soma exata; não é repetido integralmente em cada caixa. Volumes idênticos compartilham uma consulta. Duas consultas de volume podem ocorrer em paralelo, com prazo total de 45 segundos, cancelamento após erro e caches curtos por empresa.

Uma opção só é apresentada quando o mesmo serviço atende todos os volumes. O frete é a soma das cotações por volume e o prazo é o maior prazo retornado. O menor preço disponível é selecionado. Falhas, destinos não atendidos e dados inválidos não viram frete grátis; prazo ausente aparece como “Prazo a confirmar”. Respostas atrasadas não se aplicam a uma composição ou CEP alterado.

**A tarifa é pública e não inclui cupons ou benefícios pessoais da conta.** O usuário confere essas condições e a postagem no site. Nenhuma consulta cria etiqueta, coleta, compra ou cobrança.

## Integridade e credenciais

Cada cotação recebe um comprovante HMAC vinculado à empresa, ao ator, ao cliente e aos valores completos. O servidor verifica o comprovante antes de salvar. Uma nova cotação selecionada vale 15 minutos para o primeiro salvamento; cotações já salvas permanecem no histórico. A chave de assinatura é derivada exclusivamente no servidor de `MIMO_JADLOG_SIGNING_KEY`, se definida, ou da credencial de serviço já gerenciada pelo backend. Nenhuma chave chega à interface ou ao gateway público.

Não é necessário cadastrar `MIMO_JADLOG_TOKEN`, conta corrente, contrato ou fator de cubagem. Totais continuam em centavos com verificação independente no banco. Regras PIX, versões imutáveis, propostas privadas e isolamento entre empresas/vendedores foram preservados.

## Verificação

Testes simulados cobrem soma por volume, rateio de centavos, deduplicação de consultas, seleção de preço, erros, peso pendente, expiração e adulteração dos comprovantes, além da troca de CEP durante uma consulta. Uma consulta HTTP real com dados sintéticos confirmou a resposta do simulador público. Não foi contratada postagem nem realizada cobrança.
