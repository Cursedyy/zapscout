# Atualização de segurança das dependências

A publicação das entregas MiMo foi pausada quando o Security Scan do commit
`5ca0801` encontrou os mesmos 17 alertas altos do commit-base `36a859c`.
O usuário autorizou a correção das dependências antes da publicação.

## Alterações

- Vite 7.3.8, sem migração para outra versão principal.
- Zod 4.6.7, inclusive nas dependências transitivas: a correção publicada não
  está disponível na linha 3. Não se usa `zod/v3` como atalho.
- Overrides das versões corrigidas de browserslist, js-yaml, nanoid, sharp,
  source-map-js e undici. Mantidas as versões principais usadas pelo projeto.
- Babel 7.29.13 e Seroval 1.6.11 também corrigem os alertas baixo/moderados
  encontrados na auditoria completa. Nenhum alerta foi suprimido.
- `bun.lock` regenerado com Bun 1.4.5; instalação com `--frozen-lockfile` conferida.

As adaptações ao Zod preservam registros com chaves string, consentimento
obrigatório, mensagens públicas em português e a distinção entre rascunho e
pedido validado. Os testes verificam frete em centavos, consentimento e recusa
antecipada de coleções acima do limite. Referências:
[aviso Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) e
[guia de migração](https://zod.dev/v4/changelog).

## Verificação reproduzível

```sh
bun install --frozen-lockfile --ignore-scripts --no-env-file
bun audit --prod --no-env-file
npm run test:regression
npx tsc --noEmit
npm run build
git diff --check
```

`test:regression` usa o mesmo padrão de configuração das suítes direcionadas,
sem o transformador de funções de servidor da aplicação. Exclui somente os
arquivos `*.e2e.test.*`, que acessam PostgREST externo e precisam de ambiente
descartável e autorização separados. O comando genérico `npm test` ainda pode
selecionar esses testes; não o usar como substituto da regressão local.

A suíte antiga do painel recebeu mocks para os subfluxos com testes próprios e
expectativas atualizadas da conexão/chat atuais. O teste SQL de etapas normaliza
CRLF apenas nas entradas do banco sintético PGlite; nenhum SQL de produção foi
alterado ou aplicado.

O lint direcionado preserva o estilo dos arquivos legados. Há quatro ocorrências
preexistentes de `any` nos dois testes antigos ajustados; a checagem separada
as informa como avisos. Nenhuma regra do projeto ou verificação de segurança
foi desativada.

Não foram alterados o checkout principal, `.env.example`, `deploy/`, credenciais,
políticas de acesso ou migrações. O resultado local da auditoria não substitui
a confirmação do CI nem a verificação da versão efetivamente publicada.
