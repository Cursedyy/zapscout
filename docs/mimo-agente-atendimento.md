# Agente de atendimento MiMo

Implementação em `/mimo/agente`, inicialmente desativada. A migração `0031_mimo_agente` foi aplicada em 09/11/2026 pelo migrador, após confirmação do backup de 08/11/2026 às 11:35:57 UTC. O banco contém 32 migrações; as oito tabelas do agente usam RLS, o bucket é privado e o worker é exclusivo do servidor. O SQL original permanece em `docs/migracoes-preparadas/mimo-agente.sql` como referência. Nenhuma ativação, configuração de cron ou mensagem real foi realizada.

## Preparação e liberação

1. Verificar o backup recuperável do banco compartilhado. Só então registrar/aplicar o SQL preparado, em uma transação pelo migrador. Ele depende da base MiMo, CRM e recebimento WhatsApp já existentes. O teste local executa esse SQL e verifica também o rollback integral.
2. Publicar o código. Antes do SQL, a página informa indisponibilidade do banco; o webhook continua compatível com a assinatura anterior. Não colocar dados comerciais reais no código, em fixtures ou no bundle.
3. Conferir as variáveis já usadas pelo projeto: `LOVABLE_API_KEY`, configuração Supabase de servidor, `UAZAPI_BASE_URL`, configuração da URL pública do webhook e `CRON_SECRET`. Credenciais não entram na configuração do agente.
4. Configurar o agendador de servidor para fazer POST em `/api/public/hooks/process-mimo-agente`, com `x-cron-secret: <CRON_SECRET>`, aproximadamente a cada segundo. Cada chamada reserva no máximo um trabalho. Não usar polling de um navegador como worker. Chamadas sobrepostas são permitidas; a reserva e a autorização são atômicas. Ajustar capacidade à fila sem aumentar a frequência de chamadas ao provedor indevidamente.
5. Administração/gestão preenche conhecimento aprovado, FAQ, produtos e restrições, horários humanos (São Paulo) e mensagem de disponibilidade. O conhecimento inicial está vazio de propósito: não havia conteúdo comercial aprovado fornecido para publicação. Nenhum preço ou condição foi inventado.
6. Salvar o rascunho, testar no simulador, revisar conhecimento e encaminhamento e publicar. Simulações usam o rascunho persistido, não enviam WhatsApp nem criam leads. Encaminhamentos e políticas comerciais reconhecidas usam respostas locais; o gateway só é consultado para as demais respostas. Há limite de 30 solicitações de simulação por hora/empresa. Uma nova edição invalida o teste anterior. Publicar gera versão imutável e pausa conversas automáticas.
7. Escolher o vínculo comercial confirmado e cadastrar somente números internos autorizados. Ativar **piloto interno**. A ativação confere a identidade ao vivo e habilita o recebimento de ecos da API apenas na conexão comercial. O padrão das conexões pessoais permanece inalterado.
8. Testar no WhatsApp, conferir os bytes recebidos, presença, encaminhamento, operação humana e materiais. O piloto usa conversas/eventos próprios, sem criar leads comerciais ou alterar indicadores. Para liberar produção, é necessário ao menos um envio interno confirmado da mesma versão publicada.
9. Ativar **novos contatos**. Leads/contatos conhecidos, negociações e atendimentos humanos não são assumidos. Confirmar a operação com a equipe antes de incluir clientes reais. Pausa geral cancela trabalhos pendentes/reservados; reativação não retoma conversas pausadas. A devolução é explícita e aguarda a próxima mensagem do contato.

## Conversa e revisão

O gateway recebe somente o contexto da MiMo, a configuração publicada e mensagens da conversa. A coleta guarda valores com trechos literais de evidência e aceita correções. Valores não sustentados pela evidência são descartados. O agente responde à dúvida com conhecimento aprovado, pergunta um campo por vez e não exige CNPJ. Origem de anúncio nunca é inferida da fala do lead: metadados reconhecidos, recebidos pelo webhook autenticado, ficam no evento para consulta, sem alterar automaticamente a origem do CRM ou atribuir causalidade.

Pedidos de humano, suporte, consumo próprio, recusa de dados, parada e promessas de encaminhamento têm guardas em código. A pré-qualificação usa por padrão nome, cidade/UF, como vende ou pretende revender e interesse nos produtos; empresa e relação com compras continuam disponíveis para configurações antigas, mas não são exigidas no padrão. Conclusão gera **pré-qualificação pendente de revisão**. Confirmação/rejeição no painel é independente da qualificação oficial do CRM. Não há escrita em qualificação, responsável, receita, pedidos ou indicadores comerciais. Sem responsável, a conversa aparece na fila de distribuição do gestor; a atribuição usa a gestão existente de leads.

Administração/gestão configura e vê a operação da empresa. Vendedores, marketing e administrativo não acessam o agente de atendimento. Cada ação verifica o usuário autenticado, a empresa fixa e o papel; os RPCs repetem as verificações sob locks. RLS também restringe leituras diretas. O ajuste de 12/11/2026 bloqueia vendedores no menu e em todas as funções de servidor; o SQL incremental `docs/migracoes-preparadas/mimo-agente-acesso-gestao.sql` foi aplicado pelo migrador como `0038_mimo_agente_acesso_gestao` e restringe também RLS e RPC a administração/gestão.

O estado de parada bloqueia devolução automática, inclusive depois de uma mensagem manual. Não há retomadas automáticas. Campos e resumo permanecem separados dos dados comerciais existentes.

## Fila e envio

- Debounce padrão: 5 segundos de silêncio, teto de 20 segundos desde o começo do grupo. Nova mensagem invalida a sequência anterior e cancela respostas ainda não autorizadas.
- Presença usa `/message/presence`, separada do envio, limitada a 1,5–8 segundos. Durante a espera, a autorização é consultada a cada 250 ms. A presença é cancelada ao invalidar o trabalho, ao assumir/pausar e no `finally`; a duração no provedor também é limitada caso o processo termine abruptamente. Contrato consultado: [OpenAPI UAZAPI](https://docs.uazapi.com/openapi-bundled.json).
- Imediatamente antes do envio: identidade/credencial atuais, empresa ativa, vínculo confirmado, papel ativo do publicador, versão, estado, sequência mais recente, limites e material autorizado. Leads já qualificados ou em negociação deixam de ser elegíveis. O envio não usa `delay` no provedor.
- A autorização muda a fila para `enviando` antes da chamada HTTP. Sem ID, com erro após a autorização ou com interrupção nesse estado, o resultado é `incerta`, sem retry automático. Trabalhos abandonados são tratados depois de três minutos. Falhas de geração ou limite vão para atendimento humano.
- IDs dos envios próprios são registrados. Ecos que chegam antes do aceite HTTP aguardam reconciliação; qualquer outro envio manual encontrado mantém a conversa humana. O webhook comercial não continua na IA pessoal, inclusive em falhas. A IA pessoal também revalida o vínculo antes de processar/enviar trabalhos antigos.
- Uma chamada aceita pelo provedor já pode estar em trânsito quando uma pausa chega. Pausar bloqueia as próximas autorizações; não existe promessa de recolher uma mensagem já aceita.
- A resposta manual tem chave idempotente, ator auditado, verificação do responsável e autorização final próprias. Aceite incerto bloqueia novas tentativas pelo painel para evitar repetição.

## Materiais e áudios

Materiais (PDF, PNG, JPEG, até 5 MB) ficam em bucket privado `mimo-agente-materiais`, com nomes aleatórios e metadados da empresa. O servidor confere tipo/tamanho/assinatura, sem analisar o conteúdo. A equipe aprova o envio selecionando o material no rascunho e publicando a versão. Desativar um material impede novas autorizações mesmo em versões antigas.

Somente pedido explícito ou aceite de uma oferta contextual seleciona um arquivo publicado e ativo da empresa. O modelo não escolhe caminhos nem URLs. O servidor emite URL assinada de 60 segundos exclusivamente para o envio ao provedor. Texto e arquivo compõem um único envio, com a mesma proteção de aceite incerto. Não há acesso direto ao bucket pelo navegador, nem links públicos permanentes.

Áudios e uploads recebidos não são baixados, publicados nem transcritos. O agente informa a limitação e encaminha à equipe, sem fingir compreensão. Interpretação de áudio exige outra implementação que comprove download autenticado e transcrição privada; o endpoint público temporário atual não foi habilitado.

## Acompanhamento e testes

O painel mostra fila humana, coleta incompleta, revisões confirmadas/rejeitadas, pedidos de humano, falhas, envios incertos e tempo médio da primeira resposta. Piloto e produção ficam separados. Consumo exibe **processamentos reservados**, incluindo cancelados e respostas determinísticas; não estima tokens, dinheiro ou faturamento. O limite diário é conservador e conta esses processamentos. A lista mostra até 100 conversas recentes, até 40 mensagens e dez trabalhos recentes por conversa; indicadores agregam o histórico autorizado completo.

Executar:

```text
node node_modules/vitest/vitest.mjs run --config vitest.agente.config.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/vite/bin/vite.js build
```

Fixtures são sintéticas. A suíte cobre SQL real em PostgreSQL local descartável (PGlite), rollback, isolamento de empresa/papel/vendedor, piloto sem CRM, versões otimistas, dedupe, agrupamento, takeover, pausa, parada, extrações/correções, mídia indisponível, desativação de materiais, autorização final, resposta manual idempotente e processo interrompido sem repetição. Testes automatizados não substituem a validação interna do número, conteúdo aprovado, armazenamento real e agendador antes de produção.

## Contexto e condições comerciais versionadas

A configuração pode incluir `politicaComercial`, inicialmente nula, com mínimos inteiros em centavos por grupos de UFs, regra das demais localidades, modalidades de frete, formas de pagamento e autorização para mencionar bonificação. Não há preços reais, números internos ou documentos comerciais embutidos no código. O painel permite editar e revisar a política; qualquer alteração invalida a revisão da política. Apenas conhecimento e política revisados habilitam essas respostas.

O servidor compõe as respostas financeiras sem consultar o modelo. A localização exige UF ou nome de estado explícito nas mensagens; cidade, DDD, parceiro e campos inferidos pelo modelo não definem uma condição regional. Locais ambíguos geram pergunta de esclarecimento. As frases preservam integralmente avisos de juros e análise de crédito; não há cálculo de parcelas, taxa presumida, cotação de produto ou valor automático de bonificação. Negociação e condições ausentes seguem para a equipe.

Consumo próprio segue para a mesma fila humana; suporte pede uma descrição breve somente quando o assunto ainda não foi explicado. Recusa de dados encaminha sem insistência. Pessoa física e quem está começando podem ser pré-qualificados sem CNPJ ou empresa aberta. O modelo recebe instruções de coleta natural e não recebe a lista de telefones do piloto nem IDs de materiais. Respostas do modelo não podem introduzir termos financeiros por conta própria.

A configuração operacional real e o catálogo escolhido estão preparados apenas em arquivos locais ignorados pelo Git. A reativação do Lovable, a confirmação da publicação anterior, o agendador e o piloto real continuam adiados a pedido do usuário. Esta atualização não exige nova migração de schema: usa o JSON versionado já existente.

## Agendamento preparado para a etapa final

O script `docs/migracoes-preparadas/mimo-agente-agendamento.sql` prepara o job inicialmente inativo. Reutiliza o transporte já configurado no banco sem recuperar sua credencial para arquivos ou para o navegador. Não executar enquanto a etapa do ambiente real estiver adiada. Conferir o destino e a implantação antes de habilitar o job.

A suíte `src/lib/mimo-agente-agendamento.test.ts` executa o SQL em PostgreSQL local descartável, com transporte sintético. Cobre instalação inativa, idempotência, preservação do transporte, ausência de HTTP em filas vazias/desativadas/manuais/futuras, trabalhos vencidos, limpeza de reservas interrompidas, recusa de transporte inválido, colisão de nome e rollback integral em falha tardia. O mock de `pg_cron` valida a lógica SQL; o contrato e a execução do agendador instalado continuam sujeitos à homologação no ambiente real.

O pacote privado de implantação contém configuração, catálogo, roteiro e verificação de integridade. Não colocar telefones, condições comerciais reais ou PDFs neste repositório. A configuração deve passar pelas funções autenticadas, revisão de versão e simulador; não gravar diretamente nas tabelas para contornar esse fluxo.

Antes da instalação do agendador, `docs/migracoes-preparadas/mimo-agente-preflight.sql` reúne consultas somente de leitura para conferir extensões, schema, RLS, bucket, permissões e metadados do transporte. As consultas não retornam o comando nem credenciais do cron. O intervalo em segundos deve ser suportado pelo pg_cron instalado; o teste local substitui apenas suas funções de gerenciamento. Não reaplicar a migração 0031 nem ativar modos para corrigir resultados inesperados.
