## Resumo do estado atual

- **RLS**: já está 100% configurado nas 17 tabelas — `auth.uid() = user_id` em todas. Nada a fazer.
- **Crons** (`/api/public/hooks/process-*`): atualmente **sem nenhuma proteção** — qualquer um pode disparar.
- **Rate limiting**: não existe nenhuma primitiva no backend (Workers stateless + Supabase). Vou implementar via tabela `rate_limits` no Postgres usando função `SECURITY DEFINER` (janela deslizante por chave). Tradeoff: +1 round-trip ao DB em cada request protegido.
- **Honeypot/bot-blocking**: o login é via Supabase Auth (`signInWithPassword`) direto no cliente — não há endpoint próprio. Honeypot só faz sentido validado server-side; vou implementar como validação client-side antes do `signInWithPassword`/`signUp` (descarta o submit se preenchido).

## O que vou implementar

### 1. Cron secret (`x-cron-secret`)
- Novo secret `CRON_SECRET` (vou pedir após aprovação).
- Helper `requireCronSecret(request)` em `src/lib/cron-auth.server.ts` — comparação timing-safe.
- Aplicar nos 3 endpoints: `process-campaigns.ts`, `process-followups.ts`, `process-prospeccao-auto.ts`. Retorna 401 sem o header válido.

### 2. Rate limiting (tabela `rate_limits`)
Migration:
```
CREATE TABLE public.rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
-- função check_rate_limit(_key, _max, _window_secs) returns boolean
```
Helper `src/lib/rate-limit.server.ts` com função `checkRateLimit(key, max, windowSecs)`.

Aplicar em:
- **Login**: 5 tentativas / 15 min por IP. Como o Supabase Auth roda no cliente, vou criar um server fn `precheckLogin({ email })` chamado ANTES do `signInWithPassword`. Key = `login:<ip>`. IP via header `cf-connecting-ip` / `x-forwarded-for`.
- **Endpoints públicos `/api/public/hooks/*`**: 10 req/min por IP. Key = `pubhook:<ip>:<path>`. Aplicado nos 3 handlers junto com o `cron-secret` (o secret pula o limite — cron legítimo não bate no teto).
- **Buscas de leads**: 30/h por usuário. Aplicar em `buscarLeadsReais` e `buscarLeadsFallback`. Key = `busca:<user_id>`.

### 3. Sanitização de inputs de busca
- Zod schema em `src/lib/sanitize.ts`: `safeQueryString` que faz `.trim().slice(0, 200)` e remove caracteres de controle e `; -- /* */` (apesar do Supabase usar parâmetros parametrizados). Aplicado em `nicho`, `cidade`, e quaisquer queries livres antes de enviar pra Apify/Serpapi.

### 4. Honeypot + bot UA blocking
- Campo `<input name="website" tabIndex={-1}>` invisível (`position:absolute; left:-9999px`) nos forms de auth. Submit cancelado se preenchido.
- Lista de UAs bloqueados (`scrapy`, `curl`, `wget`, `python-requests`, `bot`, `crawler`, `spider`) — middleware request-level em `src/start.ts` que retorna 403 quando a rota começa com `/api/public/` e UA bate.

### 5. Security headers
- Adicionar no `src/server.ts` (entry do Worker) ou via middleware request-level no `start.ts`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Arquivos novos
- `supabase/migrations/<ts>_rate_limits.sql`
- `src/lib/rate-limit.server.ts`
- `src/lib/cron-auth.server.ts`
- `src/lib/sanitize.ts`
- `src/lib/bot-detection.server.ts`

## Arquivos editados
- `src/start.ts` (UA block + security headers middleware)
- `src/routes/api/public/hooks/process-campaigns.ts`
- `src/routes/api/public/hooks/process-followups.ts`
- `src/routes/api/public/hooks/process-prospeccao-auto.ts`
- `src/lib/buscar-leads.functions.ts`
- `src/lib/buscar-leads-fallback.functions.ts`
- `src/lib/auth-precheck.functions.ts` (NOVO server fn pra rate limit de login)
- Login/Signup forms (honeypot + chamada ao precheck)

## O que NÃO vou fazer
- RLS: já está pronto.
- Mexer no fluxo de email/password do Supabase (não dá pra interceptar do lado deles).
- Bloquear o `signInWithOAuth` Google — já passa pelo broker Lovable.

## Confirmações necessárias
1. **OK em criar a tabela `rate_limits` no Postgres?** É o único caminho viável.
2. **OK em pedir o secret `CRON_SECRET`?** Você vai precisar configurar no agendador externo (pg_cron, cron-job.org, etc) pra enviar o header `x-cron-secret`.
3. **Quer ajustar algum limite?** (5/15min login, 10/min hooks, 30/h busca)
