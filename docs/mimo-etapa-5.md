# MiMo — Etapa 5: importação de CSV do Meta Ads

## Decisões
- **Formato aceito:** CSV exportado do Gerenciador de Anúncios, separado por `;` ou `,`, cabeçalhos em português ou inglês. Datas `dd/mm/aaaa` ou `aaaa-mm-dd`. Valores `1.234,56`, `1234.56` ou `R$ 10,00`. Até 2 MB / 20.000 linhas.
- **Obrigatórios:** Campanha e Data (`Dia` ou `Início dos relatórios`). Os demais são opcionais; colunas ausentes ou células vazias ficam **vazias (NULL)**, nunca zero, e a prévia avisa.
- **Chave de deduplicação:** empresa + data inicial + data final + campanha + conjunto + anúncio (sem diferenciar maiúsculas/espaços). Repetidas no mesmo arquivo: só a primeira entra, as outras viram erro. Reimportação de um período já gravado **substitui** os valores, nunca soma. Arquivo idêntico (mesmo SHA-256) é recusado.
- "Leads (Meta)" fica numa coluna própria (`leads_meta`), separada do CRM `mimo_leads`. Não vira lead qualificado nem venda.

## Segurança
- Tabelas `mimo_meta_ads_importacoes` (histórico: arquivo, responsável, contagens, erros, período) e `mimo_meta_ads_metricas`, com RLS: só membros ativos da MiMo leem. Nenhuma escrita direta pelo cliente (só SELECT concedido).
- Gravação somente pela RPC `mimo_importar_meta_ads` (security definer), que exige administrador ou gestor via `tem_papel_empresa`, numa única transação (falha = nada gravado).
- A função do servidor revalida o CSV inteiro; a prévia do navegador nunca é confiável. Empresa fixa `mimo`, nunca vinda do navegador. Vendedores só consultam o histórico.

## Arquivos
- `drizzle/migrations/0010_mimo_meta_ads_importacao.sql`
- `src/lib/mimo-meta-ads.ts` (leitura/validação), `mimo-meta-ads.server.ts`, `mimo-meta-ads.functions.ts`, `mimo-meta-ads.test.ts`
- `src/components/mimo-meta-ads-page.tsx`, `src/routes/_authenticated/mimo.meta-ads.tsx`, item "Meta Ads" no menu em `mimo.tsx`
- Tipos do banco regenerados automaticamente.

## Testes
- 9 testes novos (CSV válido PT/EN, vazio, sem dados, colunas ausentes, datas/valores inválidos, inteiros, duplicadas, moedas/datas, hash estável) + suíte existente: 173 aprovados, 8 ignorados.
- Banco, simulação desfeita: externo não importa (42501); mesmo arquivo recusado; reimportação do mesmo dia trocou 10 → 12 (sem somar, 1 linha); escrita direta negada (42501); externo e visitante veem 0 linhas/histórico. Nada persistido.
- Navegador como administrador: prévia com 3 linhas (1 válida, 1 duplicada, 1 data inválida), campos vazios marcados como "vazio", cancelamento limpa a prévia, histórico vazio.

## Pendências
- Confirmação real de importação pela tela não feita para não gravar dados fictícios na produção; aguarda um CSV real da MiMo.
- Gestor/vendedor validados no banco/código, não com sessões reais. Publicação não realizada. Etapa 6 não iniciada.
