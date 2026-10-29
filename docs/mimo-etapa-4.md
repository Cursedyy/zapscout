# MiMo — Etapa 4

## Impacto e limite de ativação
- Adicionado recebimento independente antes da deduplicação pessoal no webhook existente. IA, CRM e histórico pessoal continuam no mesmo fluxo; nenhum registro pessoal é copiado para MiMo.
- Erro MiMo é registrado com código seguro; o fluxo pessoal continua e a resposta é 503 para permitir repetição pelo provedor. A transação MiMo deduplica por vínculo/ID de mensagem; a deduplicação pessoal evita repetir a IA na nova tentativa.
- A identificação exige vínculo explícito, com hash da credencial, dono e instância, confirmado por administrador ativo. Não usa conteúdo nem presume que Gustavo/Matheus sejam donos do número comercial.
- O número comercial e a conta conectada não foram informados. Nenhum vínculo foi criado/ativado; portanto, por segurança, nenhuma mensagem será associada automaticamente à MiMo até a confirmação.
- A ativação será feita somente no servidor após confirmação do número real na UazAPI e da conta/instância; nenhuma credencial é exibida no frontend.

## Estruturas e segurança
- `mimo_whatsapp_vinculos`: configuração exclusivamente gerenciada no servidor, leitura somente por administrador da empresa; sem token cru.
- `mimo_whatsapp_eventos`: histórico de mensagens separado por empresa e vínculo, único por ID do provedor; leitura por membros ativos, sem escrita por usuários.
- `mimo_whatsapp_diagnosticos`: códigos de erro/ignorados, sem texto de conversa, telefone ou token; leitura por administradores/gestores.
- `mimo_leads`: primeiro e último contato WhatsApp. Novos contatos recebem origem WhatsApp, entrada pela data original e campos comerciais padrão. Existentes só atualizam datas de contato; origem anterior, responsável, etapa, qualificação e valor são preservados.
- RPC restrita ao serviço: valida vínculo ativo, empresa MiMo ativa e administrador confirmador ativo; bloqueia identidade divergente, serializa recebimento, grava mensagem e lead na mesma transação.
- Grupos/status/telefone inválido/LID sem telefone real/sem ID estável são ignorados. Mensagem enviada registra histórico sem criar lead ou avançar datas de recebimento. Eventos fora de ordem usam menor/maior data.
- Nenhuma mudança na IA. Imports privilegiados do webhook foram movidos para depois da autenticação; removido log de payload bruto que podia conter credenciais.

## Arquivos
- `drizzle/migrations/0009_mimo_whatsapp_recebimento.sql` e tipos regenerados.
- `src/lib/mimo-whatsapp.ts`, `src/lib/mimo-whatsapp.server.ts`.
- `src/lib/mimo-whatsapp.test.ts`, `src/lib/mimo-whatsapp.server.test.ts`, `src/lib/mimo-webhook-regression.test.ts`.
- `src/routes/api/public/uazapi-webhook.ts`, `AGENTS.md`, `roadmap.md`, este relatório.

## Pendências
- Confirmar número comercial e conta/instância conectada para ativar vínculo seguro.
- Publicar e enviar mensagem real; conferir lead, datas e histórico no banco e no ambiente MiMo. Não há simulação de sucesso com WhatsApp real.
- Nenhuma Etapa 5 iniciada.