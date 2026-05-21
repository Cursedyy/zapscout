# Sequências de Follow-up automático

O projeto já tem uma cadência fixa de 3 etapas (`/app/follow-ups`, com `sequence` no lead, `followupDias` no profile e cron `process-followups`). Esta entrega substitui essa estrutura por **múltiplas sequências configuráveis** persistidas no Supabase, sem quebrar o fluxo atual de leads/CRM.

## 1. Banco de dados (migration)

Duas tabelas novas, com RLS por `user_id`:

- **`sequencias`**: `id, user_id, nome, objetivo, ativa, parar_ao_responder, parar_ao_fechar, parar_ao_mover_crm, etapas (jsonb)`. `etapas` = `[{ ordem, intervalo, unidade: 'horas'|'dias', mensagem }]`.
- **`sequencia_execucoes`**: `id, user_id, sequencia_id, lead_id, etapa_atual, etapas (jsonb com status por etapa), pausada, cancelada, parada_por_resposta, started_at`.

Trigger `handle_new_user` ganha seed das 3 sequências padrão ("Clássica 3 etapas", "Agressiva 5 etapas", "Pós-reunião").

O campo `sequence_state` em `leads` permanece (compat), mas as novas execuções vivem em `sequencia_execucoes`.

## 2. Nova página `/app/sequencias`

- Header com botão **+ Nova sequência** e badge de execuções ativas.
- Grid de cards (uma por sequência) com nome, nº etapas, leads ativos, taxa de resposta.
- Tabela "Leads em sequência agora" com status (Ativa/Pausada/Concluída/Parada/Cancelada) e ações (pausar/retomar/cancelar).
- Click no card → modal de métricas (performance por etapa + dica da etapa mais efetiva).

Entrada no sidebar com badge de ativos.

## 3. Criador visual (modal)

- Passo 1: nome, objetivo (vender site / automação / reunião / outro), condições de parada (checkboxes).
- Passo 2: lista de etapas editáveis com intervalo + unidade entre cada uma, textarea com mensagem, chips de variáveis `{{nome}}`, `{{cidade}}`, `{{nicho}}`, e botão **Gerar com IA** (usa o endpoint que já existe em `/app/ia`).
- Botão "+ Adicionar etapa", remover etapa, validação de limites por plano.

## 4. Atribuição a leads

- No `LeadCard` (busca + CRM): dropdown **▶ Iniciar sequência** com lista de sequências + opção "Nova".
- Modal de confirmação mostrando cronograma calculado e preview da 1ª mensagem.
- No CRM: barra de seleção múltipla → **Iniciar em lote** com escalonamento (todos agora / distribuir em X horas / 1 dia).
- Indicador visual (relógio roxo) no card do kanban quando o lead tem execução ativa, com tooltip do próximo envio.

## 5. Motor de agendamento

- Cliente: hook `useSequenceEngine` que roda no mount do `app.tsx` e a cada 60s — busca execuções pendentes vencidas via server fn e dispara via UAZAPI (fluxo já existente em `uazapi.server`), marcando `etapas[i].status = 'enviada'`. Toast por envio.
- Servidor: atualizar `src/routes/api/public/hooks/process-followups.ts` para iterar `sequencia_execucoes` em vez de `sequence_state`. Mantém o pg_cron já configurado.
- Parar automaticamente quando o lead muda para `respondeu`/`fechado`/`perdido` (hook em `updateLeadStatus`).

## 6. Limites por plano

Em `src/data/planos.ts`, adicionar `limitesSequencias` (free=1 seq/3 etapas/5 leads; pro=20/10/200; agencia=999). `UpgradeModal` é disparado ao exceder.

## 7. Notificações

- Banner no topo do app quando há envios agendados para hoje (componente novo em `app.tsx`).
- Toast de resposta detectada (já temos `marcarRespondeu`, integrar com sequência).
- Toast de sequência concluída sem resposta com ações "Mover para Perdido" / "Tentar outra".

## 8. Deprecação suave

A página `/app/follow-ups` (3 etapas fixas) passa a ser um **link de redirecionamento** para `/app/sequencias`, mantendo a entrada do sidebar ou removendo-a para evitar duplicidade.

---

## Detalhes técnicos

- Frontend: rota `src/routes/app.sequencias.tsx`, store em `src/store/sequencias-store.tsx` ou estender `app-store`, server fns em `src/lib/sequencias.functions.ts`.
- Variáveis renderizadas pelo helper existente `renderTemplate` (precisa aceitar variáveis arbitrárias).
- Métricas calculadas em SQL via view ou agregação no client a partir de `mensagens_enviadas` + `sequencia_execucoes`.
- Backend real reaproveita `uazSendText` e o cron pg_cron já agendado.

---

## Escopo / fora de escopo

**Inclui:** tudo do checklist (criação, atribuição individual e em lote, painel, motor cliente+cron, métricas, limites, indicador no kanban, 3 sequências padrão, toasts).

**Não inclui:** detecção real de resposta inbound (depende do webhook UAZAPI que já está parcialmente implementado — vai apenas reagir quando `marcarRespondeu` for chamado); editor drag-and-drop de etapas (reordenar fica com botões ↑/↓); A/B testing entre sequências.

---

## Pergunta antes de começar

A entrega toca DB (2 tabelas + seed no signup), 6-8 arquivos novos e edita ~10 existentes. É grande — quer que eu:

**(A)** implemente tudo de uma vez (uma migration + todos os arquivos), ou
**(B)** divida em 2 fases: **Fase 1** = criar/listar sequências + atribuir individual + motor (MVP funcional); **Fase 2** = lote, métricas detalhadas, banner/notificações, indicador no kanban?

Recomendo **(B)** para você poder testar antes de ampliar.
