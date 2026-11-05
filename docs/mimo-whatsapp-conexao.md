# Conexão do WhatsApp MiMo — diagnóstico e pareamento

## Situação observada em 05/11/2026

A equipe tentou conectar o número remetente de recuperação de carrinhos. A tela mostrou status desconhecido e falha genérica ao gerar QR. Leitura apenas de metadados confirmou uma instância já cadastrada na conta administradora; o token não foi recuperado nem exibido. Não há vínculo comercial confirmado na MiMo. O erro antigo não permite afirmar se houve credencial recusada, servidor inacessível ou payload incompatível.

## Ajustes

- Pareamento POST /instance/connect envia corpo JSON vazio conforme contrato público. Mantida a instância cadastrada; não há exclusão, recriação ou troca automática de token.
- Cliente UAZAPI classifica status HTTP, rede e timeout sem incluir corpo sensível da resposta. Preserva o sinal normalizado de sessão desconectada usado pelos fluxos de envio existentes. Requisições têm timeout e não seguem redirecionamentos com credenciais.
- Criação mantém a rota legada /instance/init e só tenta /instance/create quando recebe 404/405, sem retry de criação após erro de rede, autenticação, limite ou HTTP 5xx.
- Tela distingue falha de consulta, webhook e pareamento. Configuração de recebimento continua obrigatória antes de solicitar QR; a captura de leads só é ativada após confirmação explícita da identidade do número.
- Consulta de status retorna QR seguro quando pronto. Tela atualiza a cada 12 segundos enquanto o serviço informa connecting, mesmo sem QR inicial; QR é removido ao confirmar connected. Somente base64 PNG limitado é aceito.

## Validação e pendências

Testes isolados cobrem JSON vazio, GET sem corpo, erros sem vazamento, compatibilidade de criação, ausência de retry de mutações, propriedade da sessão, ordem webhook/pareamento, QR tardio e manutenção da confirmação manual de captura. Consulta real do provedor depende de nova ação autenticada na tela após publicação. Se a credencial/servidor for recusada, a mensagem informa o HTTP; não substituir sessões com base em erro genérico.

Referências oficiais consultadas: https://docs.uazapi.com/docs/getting-started, https://docs.uazapi.com/docs/server-url, https://docs.uazapi.com/docs/authentication e https://docs.uazapi.com/docs/errors-and-retries.

Validação concluída: 51 testes do WhatsApp, TypeScript, lint dos três arquivos de produção alterados e build (código 0). Código enviado para main no commit acbd43a8b54257a655a656fcc160c66690d95945. Nenhuma credencial ou sessão existente foi substituída. Publicação e conferência real na tela são necessárias para confirmar o pareamento.

## Conferência segura do endereço configurado

Lovable permite apenas excluir o segredo cadastrado; não solicitar exclusão/substituição para descobrir o valor. Diagnóstico da tela autenticada de administração exibe somente a origem do servidor (protocolo, host e porta), removendo usuário, senha, caminho, query e fragmento. Valores inválidos não são reproduzidos. Nenhum token ou segredo de webhook é exibido. 53 testes passaram, incluindo sanitização da origem. Essa alteração permite a equipe informar o domínio para conferir DNS/TLS/conectividade sem manipular segredos na hospedagem.
