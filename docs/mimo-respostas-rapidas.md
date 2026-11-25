# Resposta rápida por contato

## Causa e escopo

O botão do chat MiMo usava um corpo literal compartilhado (`RESPOSTA_RAPIDA_MIMO`) sobre catálogo, produtos e primeiro pedido. A saudação já podia usar o primeiro nome; não havia geração por IA nem carregamento de modelos configuráveis nesse atalho. Portanto, a padronização observada vem do corpo fixo, não de uma sugestão assíncrona global comprovada.

Os dois pontos de uso já montavam o chat com chave usuário/lead. A nova proteção fica no próprio `WhatsAppLeadMimo`: a instância de estado é recriada quando muda empresa, usuário, lead ou telefone. Assim, chamadas futuras que não forneçam uma chave React externa também não reaproveitam rascunhos, filas visuais ou estados de envio de outro contato. As consultas e preloads passam a incluir empresa, além de usuário/lead/página, preservando o cancelamento por sinal já existente.

## Comportamento

- O modelo compartilhado permanece o mesmo. A prévia usa o primeiro nome válido e, quando informada, a empresa do lead atual.
- Os pontos de uso passam `nome_contato`, `nome_empresa` e `empresa_id` do registro autorizado; nome da empresa não é tratado como nome da pessoa.
- Sem nome válido, a saudação é neutra. Sem empresa, conserva o corpo padrão. A interface explica o fallback.
- O texto é editável. O atalho não substitui rascunho existente, não acessa mensagens de outros leads e não envia automaticamente.
- Nenhuma biblioteca paralela de respostas, template persistente, regra de IA ou tabela foi criada/alterada.
- Uma resposta tardia de histórico permanece na consulta do contato original; callbacks de envio pertencem à instância desmontada e não alteram a conversa nova. Envios já solicitados manualmente mantêm seu lead e protocolo de idempotência originais: trocar de tela não cancela uma operação que o provedor possa já ter aceitado.

As funções server-side existentes continuam revalidando papel, empresa e lead, além da autorização final do envio. O `empresaId` adicionado à chave do cache é isolamento local, não autorização aceita do navegador. Não houve mudança de RLS, RPC de envio, credenciais ou provedor.

## Verificação

Fixtures sintéticas e mocks cobrem dois contatos, edição manual, troca durante consulta e envio, retornos fora de ordem, empresa/usuário/telefone diferentes, campos ausentes e preservação da mensagem compartilhada. A suíte ampliada também verifica envio, leitura autorizada, dedupe e banco temporário.

Comando: `npx vitest run --config vitest.mimo-whatsapp.config.ts --configLoader runner`.

Durante a regressão, os testes preexistentes da tela de conexão estavam sem mock de usuário autenticado e buscavam um texto alternativo de QR antigo. Foram atualizados somente os fixtures/expectativas para o contrato atual, sem mudar o comportamento da tela de conexão. Nenhum envio real ou pareamento foi realizado.
