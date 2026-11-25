# Codex no painel MiMo

## Auditoria e decisão

O rascunho não commitado do checkout principal foi lido, sem alterá-lo: `src/lib/codex.ts`, teste, `/app/codex`, `/api/codex`, documentação e entrada do menu. Foram reaproveitados os modos gerar/editar trecho TypeScript, limites de 4.000/20.000 caracteres, construção textual da tarefa e mensagens de erro locais. Não foram copiados deploy, migração, configuração self-host ou valores de ambiente.

A documentação oficial consultada em 25/11/2026 confirma tanto o [modelo `gpt-6.2-sol`](https://developers.openai.com/api/docs/models/gpt-6.2-sol) quanto a [Agents API e seu cabeçalho beta](https://developers.openai.com/api/docs/guides/agents-api/quickstart). Não são identificadores inventados. O novo fluxo, porém, usa a [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), pois precisa somente de texto, sem sessões de agente ou execução em sandbox.

Problemas encontrados no rascunho: rota fora do MiMo; autenticação sem papel/associação à empresa; limitador que permitia chamadas após falha do banco; leitura de corpo ilimitada; ausência de prazo/cancelamento; parser limitado a LF que ignorava frames malformados e emitia sucesso ao terminar a conexão. A alteração resolve esses pontos na worktree.

O menor fluxo preservado é uma **ferramenta administrativa de trechos de código** em `/mimo/codex`, para administrador/gestor ativos. Justificativa: é o único comportamento de produto definido no rascunho, pode ser revisado manualmente e não exige conectar repositório, CRM ou credenciais ao modelo. Não é um agente que corrige ou publica o aplicativo sozinho. Outras funções de negócio exigem definição própria.

## Contrato do produto

- `GET /api/mimo/codex`: verifica sessão e papel antes de retornar somente `configurado: boolean`. Não chama a OpenAI.
- `POST /api/mimo/codex`: requer Bearer Supabase verificado e associação ativa à empresa MiMo. Papéis diferentes de administrador/gestor são recusados no servidor, independentemente do menu.
- JSON estrito: `mode: generate | edit`, `prompt` de 10–4.000 caracteres, `code` até 20.000 caracteres e `language: typescript`. Edição exige código; geração recusa código oculto e campos extras.
- A interface informa o envio do texto colado à OpenAI, exige submissão explícita, renderiza o resultado como texto e oferece cancelamento. Não executa HTML/JavaScript/SQL nem aplica patches. Logout/troca de usuário cancela o pedido e limpa o estado; resultados tardios não substituem outra solicitação.
- Corpo limitado a 128 KiB e 10 segundos. Saída limitada a 32.000 caracteres; transmissão a 1 MiB, frame a 256 KiB e operação upstream a 90 segundos.
- Limite persistente de dez tentativas de geração por empresa/usuário/hora pela RPC existente `check_rate_limit`. Falha do limitador bloqueia a chamada paga. Não há retentativa automática.

O [contrato oficial de Responses](https://developers.openai.com/api/reference/resources/responses/methods/create) fundamenta o POST fixo `https://api.openai.com/v1/responses`, Bearer server-side, `stream: true`, `store: false`, `tools: []`, `tool_choice: none`, `max_output_tokens: 4096` e raciocínio `low`. Não é enviado cabeçalho Agents beta. `store: false` desativa armazenamento para recuperação posterior pela API; não é promessa de ausência de toda retenção no provedor.

O parser segue os [eventos semânticos documentados](https://developers.openai.com/api/docs/guides/streaming-responses): somente `response.output_text.delta` vira texto, `response.completed` confirma o fim; falha, recusa, incompletude ou EOF sem terminal não viram sucesso. Metadados e texto completo de `output_text.done` não são repetidos. O SSE local expõe somente `delta`, `complete` e `error` seguro. UTF-8 fragmentado, CR/LF/CRLF, comentários e dados multilinha são tratados; frames inválidos encerram a geração como incompleta.

## Configuração segura

`OPENAI_API_KEY` fica exclusivamente no gerenciador de segredos do servidor, sem prefixo `VITE_`. O modelo padrão e único validado nesta entrega é `gpt-6.2-sol`; `OPENAI_CODEX_MODEL` pode ser omitido ou conter esse valor. Outro valor deixa a integração indisponível até revisão explícita do modelo/contrato. O modelo aceita Responses e streaming; raciocínio `none` não é usado.

Conforme a [documentação oficial de contas de serviço](https://developers.openai.com/api/docs/guides/terraform/service-accounts), use projeto/conta/chave com a permissão mínima `api.responses.write`. Este fluxo não precisa de permissões Agents, arquivos, ferramentas ou administração. Não use uma chave administrativa como credencial da aplicação. O provisionamento não foi realizado nesta tarefa.

A autenticação usa as variáveis Supabase existentes; o limitador usa a credencial de serviço apenas para sua RPC. A integração não registra prompts, código, respostas, tokens ou corpos de erro upstream. A chave OpenAI só vai no header do servidor ao host fixo; redirects são recusados. A resposta HTTP/SSE recebe `Cache-Control: no-store`. Falhas 429/5xx e configuração ausente têm mensagens locais, sem detalhes do provedor.

## Entrega e validação

Somente a worktree foi alterada, sem commit, push, deploy ou chamadas reais à OpenAI. Testes usam upstream e autenticação mockados, incluindo permissões, limites, configuração, fragmentação, frames inválidos, desconexão, cancelamento, timeout e UI com texto não executável.

Comando: `npx vitest run --config vitest.mimo-codex.config.ts --configLoader runner`.

Ao integrar ao checkout principal, **não publicar também os rascunhos antigos `/app/codex` e `/api/codex`**. Eles continuam intocados naquele checkout por instrução expressa. O responsável pela integração deve substituir/excluir esses rascunhos e a entrada antiga do menu antes da publicação, preservando os demais trabalhos. A worktree contém somente a nova rota MiMo e o endpoint autorizado.

Disponibilidade real do modelo, permissão da chave, limites do projeto e comportamento de desconexão na hospedagem ainda exigem validação após configuração autorizada. Cancelar aborta o transporte upstream; não garante estorno de processamento já realizado pelo provedor.
