# Tira-pedido simplificado e frete Jadlog

O modelo de PDV carrega os produtos ao ser escolhido. Preços e pesos vêm do catálogo; caixas são sugeridas pela composição cadastrada e o valor provisório da mercadoria acompanha produtos, descontos e brindes. Preço negociado, descontos, bonificações, faturamento e composição manual continuam disponíveis em seções expansíveis. A confirmação das caixas/pesos continua explícita e não confirma recebimento, nota fiscal ou expedição.

Um novo pedido pode recuperar CEP e endereço do último pedido não cancelado e com destino preenchido, sempre por leitura autorizada do mesmo cliente/empresa. Trocar o cliente limpa o endereço e as cotações anteriores; respostas atrasadas não substituem a escolha atual nem o endereço já digitado.

## Integração direta Jadlog

Documentação oficial utilizada: https://www.jadlog.com.br/jadlog/arquivos/api_integracao.pdf (versão 2.3, agosto/2025, páginas 21–22).

A consulta usa exclusivamente o endpoint HTTPS de simulação. Não cria coleta, etiqueta, envio ou cobrança. CEPs, valor da mercadoria e maior peso entre real e cubado são calculados no servidor a partir do documento validado e das caixas autorizadas. Não se presume fator de cubagem: cada serviço recebe o divisor acordado no contrato.

Configurar no Lovable, em **More → Settings → Secrets**; não colocar tokens no código, em campos `VITE_` ou no chat:

| Nome | Conteúdo |
| --- | --- |
| `MIMO_JADLOG_TOKEN` | Token fornecido pela Jadlog para a MiMo |
| `MIMO_JADLOG_CNPJ` | CNPJ do tomador do serviço, com 14 dígitos |
| `MIMO_JADLOG_SERVICOS` | JSON com 1–3 serviços: `codigo`, `nome`, `divisorCubagem`, confirmados no contrato |
| `MIMO_JADLOG_CONTA` | Conta corrente Jadlog, se aplicável |
| `MIMO_JADLOG_CONTRATO` | Contrato Jadlog, se fornecido |

Os parâmetros dependem do contrato real. Se a MiMo usar Melhor Envio, Frenet ou outro intermediário, será necessário conectar o provedor contratado; o token dessa plataforma não substitui o token Jadlog direto.

Quem assume o custo no pedido é uma decisão comercial separada da cobrança pela transportadora. A simulação usa `frap=N`: selecionar “Cliente paga” não autoriza cobrar o frete da transportadora no destino.

Com a integração configurada, o endereço preenchido e as caixas conferidas, a consulta ocorre automaticamente após estabilização dos dados. O menor valor retornado é selecionado, com possibilidade de escolher outro serviço ou atualizar. Erros, ausência de prazo e configuração pendente são apresentados sem inventar preço ou prazo. Respostas de uma composição anterior não são aplicadas após alterações.

Cada cotação de API recebe comprovante HMAC vinculado à empresa, ao ator, ao cliente e ao conteúdo integral da cotação; o servidor o verifica antes de salvar. Uma nova cotação selecionada vale 15 minutos para o primeiro salvamento. Cotações já salvas são preservadas como histórico. Totais continuam em centavos, com validação independente do banco; não houve alteração das regras PIX, das versões imutáveis ou das propostas privadas.

## Validação e ativação

Testes usam respostas sintéticas e não fazem chamadas a contratos reais. A integração só está operacional após cadastrar as credenciais e parâmetros corretos e conferir uma cotação real da mesma remessa no portal/contrato da transportadora. Sem configuração, a tela informa a pendência e mantém o registro manual em uma opção expansível. Nenhuma credencial real foi recebida nesta implementação.
