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
