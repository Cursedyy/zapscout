# Plano: ZapScout backend real

## Visão geral

Migrar 3 camadas simultaneamente:

1. **Persistência** → leads, templates, campanhas e follow-ups saem do `localStorage` e passam a viver no Lovable Cloud (já existem as tabelas: `leads`, `campanhas`, `followups`, `mensagens_enviadas`, `whatsapp_conexoes`, `profiles`).
2. **Envio real via UAZAPI** → conectar número via QR code, enviar mensagens reais, receber respostas via webhook (que automaticamente pausa a cadência).
3. **Agendador 24/7** → cron rodando no servidor a cada 5 minutos processa follow-ups vencidos e campanhas agendadas, mesmo com o usuário deslogado.

## Ajustes de schema necessários

As tabelas existentes precisam de pequenos ajustes:

- `templates` → tabela nova (hoje só existe em código)
- `leads` → adicionar coluna `sequence_state jsonb` (sentSteps + startedAt + enabled) para cadência por lead
- `campanhas` → adicionar `template_id`, `filtros jsonb`, `items jsonb` (lead_id + status + sent_at)
- `profiles` → adicionar `uazapi_instance_id`, `followup_dias int[]`, `default_intervalo_segundos`
- Nova tabela `app_settings` opcional ou usar `profiles` para configs

## Etapas

### 1. Migration de schema (1 migration)
- Criar tabela `templates` com RLS por user_id
- Adicionar colunas faltantes em `leads`, `campanhas`, `profiles`
- Trigger `updated_at` em todas

### 2. Camada de dados (`src/lib/db/*.functions.ts`)
- `leads.functions.ts` — listLeads, addLead, updateStatus, updateNotes, setFollowUp, startSequence, stopSequence, markFollowUpSent
- `templates.functions.ts` — list/create/update/delete
- `campanhas.functions.ts` — list/create/setStatus/markItemEnviado
- `settings.functions.ts` — get/setFollowupDias, get/setIntervalo, get/setPularPreview
- Todas usam `requireSupabaseAuth` middleware

### 3. Refactor do store (`src/store/app-store.tsx`)
- Substituir `useState` + `localStorage` por React Query (`useQuery` + `useMutation`)
- Manter mesma API pública para minimizar mudança nas páginas
- Optimistic updates onde fizer sentido (drag-and-drop CRM, mark sent, etc.)

### 4. Integração UAZAPI (`src/lib/whatsapp.functions.ts` + `src/lib/whatsapp.server.ts`)
- `connectInstance()` → cria instância UAZAPI, retorna QR code
- `getInstanceStatus()` → polling do status (connecting/connected/disconnected)
- `sendMessage(leadId, texto)` → envia via UAZAPI, salva em `mensagens_enviadas`
- `disconnectInstance()` → mata sessão
- Tela `/app/whatsapp` → mostra QR + status real, não mais mock

### 5. Webhook de respostas (`src/routes/api/public/uazapi-webhook.ts`)
- Recebe POST do UAZAPI quando um lead responde
- Valida assinatura (header `apikey` do UAZAPI = nosso secret)
- Marca lead como `respondeu` e pausa `sequence_state.enabled = false`
- Insere em `mensagens_enviadas` com `respondeu = true`

### 6. Cron de follow-ups (`src/routes/api/public/hooks/process-followups.ts`)
- Chamado a cada 5 minutos via pg_cron
- Para cada usuário com sequência ativa: calcula `dueAt` baseado em `profiles.followup_dias`
- Envia via UAZAPI as mensagens vencidas (steps 1/2/3)
- Marca `sentSteps` no `sequence_state`
- Para automaticamente quando lead responde ou completa 3 steps

### 7. Cron de campanhas (`src/routes/api/public/hooks/process-campaigns.ts`)
- Chamado a cada minuto
- Inicia campanhas `agendada` cujo `agendamento <= now()`
- Para cada campanha `em_andamento`: envia os próximos items respeitando `limite_por_hora` (verifica `last_sent_at` da campanha)
- Marca como `concluida` quando todos items processados

### 8. Configuração do cron (pg_cron via supabase insert)
```sql
SELECT cron.schedule('process-followups', '*/5 * * * *', $$...$$);
SELECT cron.schedule('process-campaigns', '* * * * *', $$...$$);
```

### 9. Secrets necessários
Vou pedir via `add_secret`:
- `UAZAPI_BASE_URL` (ex: `https://free.uazapi.com` ou instância própria)
- `UAZAPI_ADMIN_TOKEN` (token admin para criar instâncias)
- `UAZAPI_WEBHOOK_SECRET` (string aleatória que valida o webhook)

## Tela `/app/whatsapp` (hoje placeholder)

QR code real + status real + botão desconectar + último ping. Sem isso, nada funciona.

## O que NÃO vai mudar
- Visual / design system / componentes UI
- Páginas de marketing (`/`, `/para/*`, `/disparo-em-massa-whatsapp`)
- Login/cadastro (já está real)
- Lógica do CRM kanban (só troca a fonte de dados)
- Mock de leads do Google Maps (continua mock — integração com Google Places não estava no escopo)

## Riscos e mitigações
- **UAZAPI free instável**: cron tem retry simples; falhas marcam `mensagens_enviadas.status = falha` mas não travam o sistema.
- **RLS no cron**: os endpoints `/api/public/*` usam `supabaseAdmin` e fazem `WHERE user_id = ...` explícito.
- **Migração quebrar dados existentes em localStorage**: vou adicionar um botão one-shot "Importar dados locais" na tela de configurações para o usuário migrar leads/templates já cadastrados.

## Ordem de execução
1. Migration de schema (você aprova)
2. Pedir secrets UAZAPI
3. Server functions + refactor do store
4. Tela WhatsApp real
5. Webhook + crons
6. Setup pg_cron
7. Testes end-to-end (eu uso `invoke-server-function` + `read_query`)

**Estimativa**: ~25 arquivos novos/editados. Posso quebrar em commits intermediários se preferir revisar em partes.

Confirma para eu começar pela migration?