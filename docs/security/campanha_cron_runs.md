# `campanha_cron_runs` — políticas e GRANTs

Auditoria das execuções do cron `process-campaigns`. Contém dados
operacionais sensíveis (`user_id`, IDs de campanhas/leads afetados, mensagens
de erro), então segue **acesso mínimo por design**: só o dono da conta lê,
e nenhum cliente escreve.

## O que é permitido

| Ação | `anon` | `authenticated` (usuário logado) | `service_role` (cron server fn) |
| --- | --- | --- | --- |
| SELECT | ❌ negado | ✅ **apenas as próprias linhas** (`user_id = auth.uid()` via `is_dono`) | ✅ tudo (RLS bypass) |
| INSERT | ❌ negado | ❌ negado | ✅ (RLS bypass) |
| UPDATE | ❌ negado | ❌ negado | ✅ (RLS bypass) |
| DELETE | ❌ negado | ❌ negado | ✅ (RLS bypass) |

Regra de ouro: **usuário só lê; só o cron escreve.** Qualquer chamada
autenticada via Data API que tente `insert/update/delete` retorna `permission
denied` — o cron precisa rodar com `SUPABASE_SERVICE_ROLE_KEY`
(`supabaseAdmin`) para gravar.

## Como isso é implementado

### GRANTs

`campanha_cron_runs` **não tem GRANTs para `anon` nem `authenticated`**. Por
padrão o Data API (PostgREST) não concede privilégios no schema `public`,
então a ausência já bloqueia escrita a nível de privilégio. Reads dos usuários
funcionam via a policy de SELECT porque o role `authenticated` recebeu
`SELECT` apenas nas colunas expostas — se algum dia isso for aberto para
outros verbos, a policy RESTRICTIVE abaixo continua barrando.

```sql
-- Nenhum GRANT para anon/authenticated. Só service_role, dono da tabela
-- (postgres), tem privilégios plenos por padrão.
-- Se for necessário reabrir SELECT explicitamente:
--   GRANT SELECT ON public.campanha_cron_runs TO authenticated;
```

### RLS

RLS está **enabled**. Policies ativas:

| Policy | Tipo | Comando | Roles | Regra |
| --- | --- | --- | --- | --- |
| `cron_runs_dono_select` | PERMISSIVE | `SELECT` | `authenticated` | `USING (is_dono(auth.uid()))` — hoje `is_dono` só é `true` para o dono da conta cadastrado no `profiles`. |
| `cron_runs_no_insert` | **RESTRICTIVE** | `INSERT` | `anon`, `authenticated` | `WITH CHECK (false)` — bloqueia qualquer INSERT via Data API mesmo se um GRANT for adicionado por engano. |
| `cron_runs_no_update` | **RESTRICTIVE** | `UPDATE` | `anon`, `authenticated` | `USING (false) WITH CHECK (false)`. |
| `cron_runs_no_delete` | **RESTRICTIVE** | `DELETE` | `anon`, `authenticated` | `USING (false)`. |

`RESTRICTIVE` é o ponto-chave: policies restritivas **combinam com AND** —
adicionar uma PERMISSIVE de escrita no futuro **não** vai destravar o INSERT
enquanto essas três existirem. É a nossa cinta de segurança contra migrações
descuidadas.

### Quem realmente escreve

Só o handler do cron em
`src/routes/api/public/hooks/process-campaigns.ts` grava aqui, e usa
`supabaseAdmin` (service role) — que bypassa RLS. O endpoint `/api/public/*`
é público, mas está protegido por `gateCronHook` (assinatura + rate limit)
antes de qualquer escrita.

## Como validar após uma migração

```sql
-- 1. RLS continua ligado?
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.campanha_cron_runs'::regclass;
-- esperado: true

-- 2. Policies presentes?
SELECT policyname, permissive, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='campanha_cron_runs'
 ORDER BY policyname;
-- esperado: cron_runs_dono_select (PERMISSIVE, SELECT)
--           cron_runs_no_delete   (RESTRICTIVE, DELETE)
--           cron_runs_no_insert   (RESTRICTIVE, INSERT)
--           cron_runs_no_update   (RESTRICTIVE, UPDATE)

-- 3. Nenhum GRANT indevido para anon/authenticated com escrita?
SELECT grantee, privilege_type
  FROM information_schema.table_privileges
 WHERE table_schema='public' AND table_name='campanha_cron_runs'
   AND grantee IN ('anon','authenticated')
   AND privilege_type IN ('INSERT','UPDATE','DELETE');
-- esperado: 0 linhas
```

## Rotas/functions e credenciais por cenário de teste

| Caminho de escrita | Rota / function | Credencial exigida | Observação |
| --- | --- | --- | --- |
| **Cron de produção** | `POST /api/public/hooks/process-campaigns` (`src/routes/api/public/hooks/process-campaigns.ts`) | `CRON_SECRET` no header `x-cron-secret` | O endpoint chama `supabaseAdmin` (service role), que bypassa RLS. Sem segredo, `gateCronHook` devolve 401 e nada é gravado. |
| **Server function client-callable** | ❌ Nenhuma. Garantia estática em `src/lib/campanha-cron-runs-client-insert.e2e.test.ts` verifica que nenhum arquivo `*.functions.ts` contém `insert/update/delete/upsert` em `campanha_cron_runs`. | N/A | Qualquer escrita via `createServerFn` seria rejeitada em revisão. |

### Credenciais usadas nos testes

| Cenário | Teste | Env vars necessárias |
| --- | --- | --- |
| `anon` negado em SELECT/INSERT/UPDATE | `campanha-cron-runs-rls.test.ts` (live) | `VITE_SUPABASE_URL` ou `SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_PUBLISHABLE_KEY` |
| `authenticated` negado em INSERT/UPDATE e isolado em SELECT | `campanha-cron-runs-write.e2e.test.ts` e `campanha-cron-runs-read.e2e.test.ts` | URL/anon key acima + `SUPABASE_TEST_USER_EMAIL` + `SUPABASE_TEST_USER_PASSWORD` |
| `service_role` (cron) consegue ler e gravar | `campanha-cron-runs-write.e2e.test.ts` e `campanha-cron-runs-read.e2e.test.ts` | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| Endpoint `/api/public/hooks/process-campaigns` rejeita sem segredo | `campanha-cron-runs-client-insert.e2e.test.ts` | `E2E_BASE_URL` (ex: `http://localhost:8080` em dev, ou URL publicada em CI) + `SUPABASE_SERVICE_ROLE_KEY` para verificar que não gravou |

Regra prática: **escrever em `campanha_cron_runs` só funciona com `service_role`**, e em produção isso só é acessível pelo cron autenticado com `CRON_SECRET`.

## Se algo aqui mudar

Ao alterar essas policies/GRANTs numa migração futura, atualize esta página
na **mesma migração** e rode os testes em `campanha-cron-runs-rls.test.ts` —
tabela sem essas 3 policies RESTRICTIVE é falha de segurança, não regressão
menor.
