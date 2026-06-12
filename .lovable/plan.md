
# Revisão e melhoria completa do ZapScout

Sua lista tem ~40 itens distintos cobrindo performance, SEO, UX, acessibilidade, landing e segurança. Fazer tudo de uma vez em um único turno é arriscado (alto risco de regressão silenciosa em CRM, campanhas, busca, aquecimento). Proponho executar em **6 fases independentes**, cada uma testável e revertível. Você confirma e eu começo pela Fase 1 — ou pula direto para a fase que quiser.

## Diagnóstico rápido (o que JÁ existe)

Antes de "fazer" qualquer coisa, vale registrar o que o projeto já tem:
- **TanStack Query** já está integrado (todas as telas usam `useQuery`/`useServerFn`).
- **Code splitting** já é automático no TanStack Start (rotas viram chunks separados via `autoCodeSplitting`). Não precisa de `React.lazy` — é o padrão errado para esse stack.
- **Toast (sonner)** já está em uso em todas as ações.
- **RLS** ligado em todas as tabelas de usuário.
- **Sidebar mobile** já existe (`app-mobile-topbar.tsx`).
- **Landing** já tem hero, problema, solução, features, FAQ, CTA (`src/routes/index.tsx`).

Vou **não recriar o que já existe** — só corrigir o que falta ou está fraco.

## Fase 1 — SEO técnico (baixo risco, alto impacto) ⭐ começar aqui

- Revisar `head()` da landing (`/`) e das páginas `/para/*`, `/planos`, `/blog`, `/disparo-em-massa-whatsapp` com title/description/og dedicados.
- Adicionar JSON-LD `SoftwareApplication` + `Organization` no `__root.tsx`.
- Adicionar JSON-LD `FAQPage` na landing.
- Verificar/atualizar `public/robots.txt` (bloquear `/app/*`, permitir resto, apontar sitemap).
- Verificar `sitemap.xml` server-route — incluir todas as páginas públicas.
- Canonical APENAS nas rotas-folha (regra do TanStack — root duplica).
- Preload da fonte principal e da imagem do hero.

## Fase 2 — Índices de banco (baixo risco, alto impacto)

Migration com `CREATE INDEX` em:
- `leads(user_id, status, created_at DESC)`
- `leads(user_id, campanha_id)`
- `mensagens_enviadas(user_id, lead_id)`
- `mensagens_enviadas(user_id, enviado_em DESC)`
- `campanhas(user_id, status, created_at DESC)`
- `followups(user_id, scheduled_at)` se existir coluna

Verifico antes quais já existem para não duplicar.

## Fase 3 — UX do CRM/Kanban e Buscar leads (risco médio)

- **Buscar leads:** "buscas recentes" via `localStorage` (últimas 5), animação stagger nos cards, botão "Buscar mais" (paginação aditiva).
- **Kanban:** scroll infinito por coluna (50 em 50), atalhos de teclado (E enviar, Del remover, Enter abrir, Shift+Click multi-select), barra flutuante de seleção com ações em massa.
- **Campanhas:** preview da mensagem com variáveis substituídas por um lead real, estimativa de tempo (`total_leads / limite_por_hora`), refetch do progresso a cada 30s.

## Fase 4 — Notificações in-app (escopo novo)

- Tabela `notificacoes` (user_id, tipo, titulo, link, lida, created_at).
- Trigger ao concluir campanha / lead responder / erro de envio.
- Sino no header com badge contador + dropdown com lista + marcar como lida.

## Fase 5 — Acessibilidade e responsivo mobile fino

- `aria-label` em todos os botões icon-only que faltam.
- Focus-visible consistente nos componentes shadcn.
- Tap targets ≥ 44px nos botões mobile.
- Auditoria das cores `text-muted-foreground/50` que falham em contraste.
- Cards do kanban em lista vertical no mobile.

## Fase 6 — Segurança e headers

- CSP via meta tag (estrita, com `connect-src` para Supabase + UazAPI).
- `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy` via meta.
- HSTS / HTTPS redirect: **só funciona com Cloudflare/proxy** — não consigo configurar daqui; deixo documentado.
- Sanitização: confirmar que nenhum `dangerouslySetInnerHTML` recebe dado de usuário.

## Itens que NÃO recomendo aplicar como pedido

Quero alinhar antes de seguir:

1. **`React.lazy()` por rota** — desnecessário e quebra padrão do TanStack Start (já faz code-splitting automático por rota). Aplicar daria zero ganho e adicionaria complexidade. Vou ignorar este item.
2. **Rating 4.8 / 127 reviews no JSON-LD** — sem reviews reais, isso é violação das diretrizes do Google (rich-result penalty). Só adiciono se você confirmar que tem reviews verificáveis.
3. **Depoimentos placeholder** com nomes/fotos fictícios — risco legal e de credibilidade. Posso adicionar a estrutura vazia para você preencher depois.
4. **Exit-intent modal com desconto** — você mesmo pediu "deixar estrutura"; vou criar o hook + componente desabilitado.
5. **Imagens WebP** — depende de quais imagens. As geradas pelo Lovable já são otimizadas; só vale converter se houver PNGs grandes específicos. Verifico caso a caso na Fase 1.

## O que preciso de você

Responda com **uma** das opções:

- **A** — "Vai fase por fase, começa pela 1" (eu paro depois de cada uma e você revisa)
- **B** — "Faz Fase 1 + 2 + 5 agora" (as de baixo risco que mais movem a agulha)
- **C** — "Faz tudo em sequência, só me chama se quebrar algo"
- **D** — Outra ordem/escopo que você quiser

Sem essa confirmação eu não toco no código — o escopo é grande demais pra adivinhar prioridade.
