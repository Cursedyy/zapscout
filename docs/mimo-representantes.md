# Representantes MiMo

Formulário público em `/representantes`, endpoint em `/api/public/mimo-representantes` e painel em `/mimo/representantes`. Inscrições são gravadas diretamente, sem criar conta, enviar e-mail ou exigir confirmação. E-mail e WhatsApp são somente dados de contato da candidatura.

Campos obrigatórios: nome, e-mail, WhatsApp com DDD, cidade/UF, região de atuação, experiência comercial, pelo menos um segmento, quantidade de clientes ativos (aceita zero), situação declarada no CORE, disponibilidade e aceite para avaliação/contato. Marcas atuais é opcional. A candidatura não garante aprovação e não há metas, comissões ou condições comerciais presumidas.

Administração, gestão e marketing têm acesso à lista e às avaliações. Vendedores, usuários sem vínculo e visitantes não têm acesso. A autorização é repetida no servidor e no banco. Tabelas próprias, separadas das inscrições de influenciadores e dos leads comerciais.

O painel oferece busca por nome/contato/região/marca, filtros por UF, etapa, experiência, segmento, CORE, disponibilidade e carteira de clientes, ordenação, paginação, ficha completa, contatos clicáveis, anotações, histórico e exportação CSV filtrada com proteção contra fórmulas. Atualiza a cada 30 segundos. Contadores por experiência incluem os cadastros recebidos em Novo, sem depender de aprovação.

Índices únicos por empresa impedem repetição de telefone canônico ou e-mail normalizado. A normalização de telefone existente na base MiMo é aplicada no servidor e por gatilho no banco; DDI, pontuação e celular antigo convergem para a mesma chave. O RPC usa inserção atômica e retorna duplicado sem sobrescrever o cadastro. O endpoint responde HTTP 409 com aviso genérico. Há checagem de origem, honeypot, limite de corpo e limite persistente por IP/hora.

Excluir da lista exige confirmação no painel, papel autorizado e versão atual. Registra responsável/data no histórico, retira o registro da lista, CSV e indicadores e mantém seus contatos reservados para novas duplicatas. Não há exclusão física de candidatos pela aplicação. Alterações concorrentes de avaliação são recusadas por versão otimista.

Migração `0035_mimo_representantes` aplicada pelo migrador Drizzle após conferir o histórico de 35 migrações e o registro de backup recuperável já verificado de 08/11/2026 às 11:35:57 UTC. SQL usa apenas ASCII e escapes Unicode para as etapas. Hash: `6c1bcb656987c9ba61c8b2d3b3b809962fb2dad583dfb865c59154fc756c2484`. Conferência: 36 migrações, três tabelas com RLS e RPC de inscrição exclusivo do serviço.

Validação local: 13 testes aprovados e TypeScript aprovado. Cobertura: omissão de cada campo obrigatório, opções inválidas, preenchimento e recuperação de erro no formulário, ficha, filtros, indicadores, exclusão confirmada, duplicidade de e-mail/número, submissões concorrentes, isolamento por papel e histórico. Testes no banco real foram executados com rollback, sem alterar candidatos reais. Verificação HTTP e publicação são registradas em `.cache/mimo-representantes-publicacao.json`.

Comando de testes: `node node_modules/vitest/vitest.mjs run --config vitest.representantes.config.ts --configLoader runner`.

Compartilhamento: título “Seja representante MiMo”, descrição em português e capa PNG MiMo de 1200×630 com fonte SVG versionada em `public/mimo/representantes-compartilhar-v1.*`.
