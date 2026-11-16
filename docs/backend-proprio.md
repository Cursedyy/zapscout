# Backend próprio e provedor direto de IA

Este ajuste prepara o código para usar Supabase próprio com hospedagem Lovable. Não altera o projeto configurado, não restaura dados e não ativa jobs. A integração se apoia no PR de diagnóstico/AI SDK e mantém o comportamento do ambiente existente até a seleção explícita do provedor.

## IA
Configurar IA_PROVIDER=anthropic, ANTHROPIC_API_KEY e IA_MODEL somente no servidor. Claude usa a API nativa /v1/messages, incluindo schema derivado do Zod para o agente. A assinatura do Claude Code não inclui API para o MiMo; a conta e cobrança da API são separadas. Não copiar credenciais de assinatura para o app.

É possível selecionar gemini com GEMINI_API_KEY, ou openai-compatible com IA_API_KEY e IA_BASE_URL HTTPS. IA_MODEL é obrigatório em qualquer modo próprio, com overrides opcionais IA_MODEL_AGENTE, IA_MODEL_CLASSIFICACAO, IA_MODEL_SCORE e IA_MODEL_CAMPANHAS. Só escolher modelos disponíveis na conta e validar com teste sintético antes de processar clientes.

Sem IA_PROVIDER, o ambiente legado mantém Lovable. Uma seleção explícita de provedor próprio nunca volta ao Lovable por falta de chave, modelo ou disponibilidade. As chamadas têm prazo de 45 segundos, zero retries HTTP e redirecionamentos bloqueados. Os erros não incluem corpos do provedor. A classificação de leads mantém fallback determinístico. O agente continua validando a saída original com Zod; restrições não suportadas no schema Claude permanecem verificadas no código. Recusas e saídas truncadas não produzem resposta nem nova chamada automática.

A imagem pública de demonstração passa a usar SUPABASE_URL configurada. É preciso copiar seus bytes para o mesmo caminho no novo Storage antes de usar essa função.

## Banco e hospedagem
Usar .env.backend-proprio.example como inventário parcial de nomes; nunca preenchê-lo e comitá-lo com segredos. Browser (VITE_SUPABASE_*) e servidor (SUPABASE_*) devem apontar para o mesmo projeto. A chave de serviço nunca vai ao cliente. Recriar todas as outras variáveis específicas das integrações no gerenciador seguro da hospedagem.

O app é TanStack Start. Suas funções autenticadas e rotas de API podem continuar como código executado pela hospedagem Lovable, acessando banco/Auth/Storage Supabase próprios e provedores externos. Isso preserva a escolha de hospedagem; não exige portar automaticamente cada função para Edge Functions. Se o requisito passar a ser frontend estático no Lovable, o servidor também terá de ser hospedado separadamente e os contratos de API adaptados.

Antes de trocar produção: validar exportação completa com contas/identidades/UUIDs, restaurar no destino isolado, transferir arquivos e preservar policies/grants/journals. Verificar SMTP, OAuth, CAPTCHA, RLS por empresa e por papel, RPCs, pedidos e downloads. Chaves de criptografia de Gmail/Nuvemshop e links de descadastro precisam ser preservadas ou migradas explicitamente. A troca da service_role afeta assinaturas de vínculos e documentos existentes.

Cron do destino permanece desligado até o corte; não deixar dois processadores ativos para a mesma fila. Preservar estados incertos e dedupe. Não usar uma restauração de backup da origem como se fosse exportação: ela sobrescreve o banco em produção.

## Validação
Testes HTTP sintéticos verificam credenciais por provedor, modelos por finalidade, recusa de endpoints inseguros, schema, saída truncada, ausência de fallback, erros sem dados sensíveis e ausência de retries. Os testes do agente usam a biblioteca real; CI também verifica tipos, build e ausência de código/segredos do provedor no bundle cliente.

Não houve teste real contra a Anthropic sem chave/conta configurada. Nenhuma evidência de CI autoriza assumir que dados, segredos ou produção já foram migrados.

Referências:
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console
- https://docs.lovable.dev/tips-tricks/external-deployment-hosting
