# MiMo — conclusão das interfaces e segurança (30/10/2026)

## Entrega e limites
Código das interfaces integrado; persistência DESATIVADA. Nenhuma migração aplicada, alteração de dado ou permissão existente, bucket criado, API conectada ou publicação realizada. Backup continua não confirmado. Não é liberação para operação em produção.

## Telas concluídas
- Lista com busca por número/cliente, estado, período, ordenação e páginas de 10/25/50/100; leituras paginadas pelo servidor. Indicadores explicitamente identificados como referentes à página exibida.
- Ações Confirmar, Aguardar pagamento, Faturar, Enviar, Entregar, Cancelar e retorno a rascunho somente quando permitido. Cancelamento com motivo; faturamento com data. Chamam ações protegidas existentes.
- PIX/recebimentos manuais com bloqueios por papel, estado, alteração não salva e persistência. Novo lead permanece bloqueado enquanto o módulo está sem gravação, impedindo escrever no CRM compartilhado por esse caminho.
- Histórico com usuário, data, ação, estado financeiro/PIX/recebimentos/motivo; comparação entre versões; restauração confirmada cria versão nova, não sobrescreve a antiga.
- Propostas emitidas: lista, emissão da versão salva, visualização, download do arquivo privado emitido e mensagem da proposta congelada. Prévia PDF continua identificada como não arquivada.
- Brindes reutilizáveis: cadastro/edição/desativação, unidade/peso/custo interno; vendedores podem oferecer brindes e bonificações, mas não configurar custos.
- Tipos de caixa: cadastro/edição/desativação e seleção na montagem manual; dimensões/capacidades congeladas no volume. Sugestão automática só usa capacidades padrão comprovadas e ativas; não inventa novas misturas.
- Carregamento, erros e mensagens de indisponibilidade; nenhuma mensagem de salvamento fictício.

## Riscos corrigidos no código e no SQL preparado
- Custos internos redigidos nas respostas do catálogo, pedidos e histórico para vendedor. Tabelas base com custos sem GRANT para navegador; visões seguras novas filtram explicitamente empresa/vínculo/lead, devolvendo custos somente à gestão. Histórico de configuração só gestão. Políticas existentes não foram modificadas.
- Servidor resolve atributos comerciais autorizados, custos de brindes reutilizáveis e preços originais, preservando preços negociados livres e condições históricas. Vendedor não injeta custo. Caixas verificadas contra configuração/histórico.
- Pedido enviado pelo navegador não aceita campos de totais arbitrários; servidor recalcula centavos. Taxas atuais ou históricas verificadas; SQL preparado recalcula produtos/descontos/cartão/frete e rejeita divergências. Frete remessa OU soma por volume, nunca ambos; brindes com venda zero.
- Matriz de 7 estados igual em TypeScript e SQL, comprovada por teste de 49 combinações. Gestão exclusiva para faturar/enviar/entregar/cancelar e receber; PIX bloqueia faturamento/envio. Encerrados não reabrem; edição comercial após faturamento bloqueada.
- SQL preparado ganhou verificação de prontidão logística e assinatura da cotação antes de avançar estado; datas reais validadas no servidor, documentos e SQL.
- PDF privado é enviado antes de registrar emissão; erro de arquivo não declara emissão bem-sucedida. Downloads usam autorização independente e retornam os mesmos bytes arquivados. Não depende de URL pública ou envio externo.

## Verificações
- Rodada final de testes: ver resultado abaixo atualizado ao concluir.
- TypeScript/build: verificação automática do ambiente; não executados manualmente. Registro mais recente sem erros (`build OK`).
- Navegador autenticado como solicitante: lista, brindes e caixas, montagem PDV Inicial, quatro volumes, PDF de 6.084 bytes; ações e salvamento/emissão desabilitados. Tela móvel 390×844 sem transbordamento horizontal. Nenhum erro de página observado.
- CRM atual `/app/leads` abriu com dados existentes e controles preservados. Foi somente leitura, sem alterações.
- Fluxos de gravação, comparação com histórico real, restauração, cancelamento e emissão/arquivo privado reais NÃO executados: exigem ativação autorizada. Gestor/vendedor reais não disponíveis; regras cobertas em testes, não confundidas com validação RLS real.
- SQL NÃO executado no Lovable Cloud. Tentativa de análise em banco temporário local não iniciou o serviço; logo sintaxe SQL executada, RLS real, concorrência e paridade financeira real no banco permanecem não verificadas.

## Ativação posterior e outras pendências
Dependem exclusivamente de ativação autorizada das estruturas: salvar/reabrir pedidos e configurações, ações de estado/PIX, histórico/comparação/restauração e listagens persistentes. Arquivos de propostas também exigem criar o armazenamento privado autorizado e validar emissão/download.
Antes de liberar: evidência de backup recuperável, aplicação revisada, configuração privada, teste real de RLS/concorrência/financeiro e conta/cliente autorizados. Contas de gestor/vendedor ainda precisam ser fornecidas para validação real; logo/fotos oficiais opcionais aguardam arquivos originais. Clientes seguem limitados a 1.000 na seleção existente; pedidos são paginados. Sem Jadlog API, cobrança/emissão fiscal automática ou publicação.

## Arquivos desta solicitação
- Novos: `src/components/mimo-pedido-acoes.tsx`, `src/components/mimo-tira-cadastros.tsx`, `src/lib/mimo-tira-seguranca.test.ts`, este relatório.
- Alterados: `src/components/mimo-tira-page.tsx`, `mimo-tira-config.tsx`, `mimo-pedido-editor.tsx`, `mimo-pedido-logistica.tsx`; `src/lib/mimo-pedido.ts`, `mimo-pedido-db.ts`, `mimo-pedido.functions.ts`, `mimo-tira-regras.ts`, `mimo-proposta.ts`; `src/styles.css`; SQL preparado; `AGENTS.md`, `roadmap.md`.
- Sem novas dependências. Sem alterar o design do CRM ou recriar embalagens.
