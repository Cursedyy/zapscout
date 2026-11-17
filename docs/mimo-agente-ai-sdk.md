# Integração de IA e diagnóstico do agente MiMo

O adaptador `mimo-agente-ia.server.ts` usa Vercel AI SDK com o gateway Lovable já existente e o modelo `google/gemini-2.5-flash`. A IA pessoal não muda. A geração usa `Output.object` e o schema aprovado; a validação comercial e a extração por evidências continuam no servidor. O SDK não tem ferramentas de envio e não decide autorizações.

Credencial necessária, somente no servidor: `LOVABLE_API_KEY`, já usada pelo transporte anterior. Instalar o SDK não fornece saldo nem substitui essa credencial. Não existe fallback automático para outro provedor. O timeout é de 45 segundos e `maxRetries=0`; a reformulação já existente continua limitada a uma segunda geração de conteúdo rejeitado pelas regras comerciais.

Falhas passam a registrar um código permitido na fila existente, sem SQL novo: crédito, limite de uso, credencial, modelo, timeout, formato, identidade do WhatsApp ou falha genérica. Não registrar corpos de erro, prompts, mensagens ou chaves. O simulador mostra uma descrição segura. Falhas anteriores, sem código, não podem ter sua causa reconstruída com certeza.

O eco de uma mensagem enviada pode usar o ID `numero_comercial:ID`, enquanto o aceite HTTP usa `ID`. O recebimento normaliza somente mensagens de saída e somente o prefixo do remetente previamente confirmado. IDs de entrada permanecem intactos. O banco continua reconhecendo ecos próprios, recusando duplicatas e pausando mensagens manuais reais; não há reativação em massa, alteração de histórico nem repetição de envios.

## Langfuse opcional

Configurar pelas variáveis seguras do servidor, sem prefixo VITE:

```text
MIMO_LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=<chave pública do projeto Langfuse>
LANGFUSE_SECRET_KEY=<chave secreta do mesmo projeto>
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

A URL deve ser HTTPS e corresponder à região ou implantação escolhida pela equipe. Sem ativação explícita ou sem as três variáveis, a exportação fica desligada e o agente continua funcionando. A criação do projeto e as credenciais do Langfuse são etapas externas; não cole chaves em chat, código ou commits.

Usamos o SDK oficial `@langfuse/otel`, com OpenTelemetry e um provider isolado por geração, sem registrar instrumentação global. Enviamos apenas modelo fixo, duração, resultado, código de falha e contagens de tokens disponíveis. Não enviamos mensagens, respostas, prompts, telefones, empresa, lead, usuário, catálogo ou condições comerciais. A exportação usa timeout de um segundo e modo imediato; falha na telemetria não altera a elegibilidade ou repete mensagens. O transporte é OTLP atual, não a API legada de ingestão.

## Homologação e entrada em operação

Instalar dependências e atualizar `bun.lock` antes de integrar. Executar suíte do agente, testes de contrato do SDK com HTTP simulado, TypeScript e build. Conferir ausência das bibliotecas e segredos no bundle cliente. Publicar somente o código validado, preservando revisão e versão comercial existentes.

Depois da publicação, simular mensagem sintética de revenda pelo painel de gestão. Se houver crédito, acesso ou formato inválido, resolver a causa apontada antes de devolver conversas. Validar um contato interno e o eco da mensagem; confirmar que uma mensagem manual real continua pausando. A equipe escolhe explicitamente quais conversas devolve ao agente. Aceite de envio não comprova entrega ou leitura.

Referências: [AI SDK: dados estruturados](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data), [provider compatível](https://ai-sdk.dev/providers/openai-compatible-providers), [Langfuse SDK](https://langfuse.com/docs/observability/sdk/overview).
