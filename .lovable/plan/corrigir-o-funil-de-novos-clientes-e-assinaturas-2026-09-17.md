# Corrigir o funil de novos clientes e assinaturas

## Diagnóstico confirmado

- Nos últimos 30 dias houve **35 novos cadastros e nenhuma assinatura registrada**; toda a base continua em Free e nenhum perfil possui pedido associado.
- O principal abandono ocorre antes da compra: **7 não confirmaram o e-mail**, **24 ficaram somente na primeira sessão** e apenas **4 voltaram depois da primeira hora**.
- A ativação também é baixa: **22 de 35 não criaram nenhum lead**, 13 criaram leads, 5 conectaram o WhatsApp e somente 3 enviaram mensagens.
- O checkout **Agência está indisponível** e exibe “Produto não está mais disponível”.
- O plano **Pro é anunciado por R$ 67**, mas a página de pagamento mostra **R$ 97/mês**, causando perda de confiança no momento decisivo.
- Não existe medição de visualização dos planos, clique em assinatura, início de checkout ou abandono. Assim, hoje não é possível distinguir quem não viu a oferta de quem desistiu no pagamento.
- O Free promete “Exportar CSV” na lista de benefícios, mas o recurso é bloqueado no produto e aparece como indisponível na comparação.
- O primeiro acesso tem orientações concorrentes, enquanto o cadastro por e-mail termina voltando para o login sem uma tela persistente de confirmação.
- Não houve chamada do webhook de pagamento nos últimos 30 dias. Além disso, o pós-compra ainda depende de uma automação externa para entregar o acesso; o app não envia esse acesso por conta própria.

## Plano de correção

1. **Restaurar confiança no checkout**
   - Trocar o link indisponível do plano Agência por um checkout ativo.
   - Unificar o preço real do Pro entre página inicial, página de planos e pagamento.
   - Corrigir a promessa contraditória de exportação no Free.

2. **Medir o funil completo sem dados pessoais**
   - Registrar cadastro concluído, e-mail confirmado, primeira busca, primeiro lead, WhatsApp conectado, primeira mensagem, visualização de planos e clique em cada checkout.
   - Adicionar um painel agregado por período e plano para localizar o abandono com números reais.
   - Não registrar nomes, e-mails, telefones ou conteúdo de mensagens nos eventos.

3. **Melhorar a ativação dos novos clientes**
   - Criar uma confirmação de cadastro clara, com instrução persistente para verificar o e-mail e opção de reenvio.
   - Consolidar as orientações iniciais em um único percurso, preservando o progresso até a primeira busca, conexão e envio.
   - Mostrar o próximo passo mais importante no painel, em vez de várias orientações simultâneas.

4. **Aproximar a oferta do momento de valor**
   - Exibir upgrade depois que o cliente obtiver resultado concreto ou atingir um limite, com o benefício pago relacionado à ação bloqueada.
   - Ajustar a apresentação do Pro para destacar automações, campanhas e follow-ups, não apenas o aumento de 20 para 50 buscas.

5. **Tornar compra e ativação confiáveis**
   - Identificar com segurança a conta que iniciou o checkout, evitando criar outra conta quando o comprador usa um e-mail diferente.
   - Atualizar o plano automaticamente após a aprovação, sem exigir nova senha para quem já possui conta.
   - Entregar confirmação e acesso automaticamente, com processamento idempotente e atualização do plano na sessão aberta.
   - Validar o fluxo completo em modo de teste: clique, pagamento aprovado, webhook, plano atualizado e recursos liberados.

## Resultado esperado

Um funil mensurável e coerente, com checkout funcional, menos abandono antes do primeiro resultado e ativação automática após a compra.
