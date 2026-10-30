# Tira-pedido MiMo — entrega de 30/10/2026

## Situação
Implementação parcial para revisão, não liberada para operação. Nenhuma publicação ou conexão externa foi feita. O banco compartilhado não recebeu migrações novas desta implementação. A confirmação do backup é pendente: não existe ferramenta para consultar seu inventário. Confirmar o snapshot mais recente em More → Database → Manage → Backups antes de aplicar o SQL preparado.

## Implementado no código e disponível na prévia
- Menu Tira-pedido exclusivo da MiMo, reaproveitando autenticação, vínculo ativo e navegação existentes.
- Catálogo de 12 produtos comerciais e 17 futuros inativos; cadastro/edição/desativação preparados, sem gravação até a migração.
- Modelos Compacto, Inicial e Completo; composição editável e duplicação em configuração.
- Pedido em edição com seleção de lead autorizado e reutilização do editor de leads/duplicidade existente.
- Centavos inteiros, preço negociado, descontos individuais e gerais sucessivos, bonificações e custos internos separados.
- Sugestão de caixas com minimização entre combinações comprovadas; movimentação manual, pesos ajustados e confirmação por volume.
- Cotação Jadlog manual por remessa ou por volume, comparação de modalidades, escolha explícita de pagador e invalidação por mudanças relevantes.
- PIX, boleto e cartão; taxas por faixa, gross-up de produtos, tarifa interna sobre frete e parcelas com centavos preservados.
- Prévia PDF e mensagem comercial copiável; nenhum envio automático.
- Código de leitura/gravação autenticada, controle de concorrência, histórico e recebimentos preparado para as novas estruturas.
- Indicadores específicos de pedidos; nenhum valor é escrito nos campos de fechamento do CRM existente.

## Preparado, mas não aplicado nem validado em banco
`docs/migracoes-preparadas/mimo-tira-pedido.sql`: três tabelas novas (configuração, documentos de pedido e versões), índices, GRANTs, RLS de leitura com vínculo ativo/lead autorizado, escrita restrita a operações privilegiadas do servidor, confirmação financeira idempotente e auditoria imutável.

As políticas e funções novas **não estão ativas**. São propostas de implementação, não evidência de segurança executada. O arquivo não entrou no journal de migrações. Não foram alteradas migrações antigas, tabelas, dados ou permissões existentes pelo desenvolvimento do Tira-pedido.

## Verificações executadas
- 25 testes novos de domínio aprovados e 1 teste integrado em memória aprovado.
- Rodada geral final: 227 testes aprovados, 8 ignorados e nenhum reprovado, em 25 arquivos.
- Verificação TypeScript executada sem erros; compilação automática mais recente: build OK.
- Navegador autenticado como o solicitante: abertura da página, PDV Inicial total R$ 968,75, sugestão de quatro volumes, download PDF de 6.084 bytes, conteúdo PDF com total esperado, salvar desabilitado por ausência de estruturas, nenhum erro de página.
- Telas vistas em 1280×1800 e 390×844; sem transbordamento horizontal observado na tela móvel.
- Cenário comercial em memória: PDV Inicial, bonificação, negociação, descontos, caixas, cotação, cartão e PDF; nenhum registro persistente de teste criado por esse cenário.

## Não verificado / pendências
- Aplicação SQL, sintaxe executada no banco, políticas RLS reais das novas tabelas, concorrência real, gravar/reabrir, versões e recebimentos persistentes. Dependem de backup confirmado e aplicação segura.
- Fluxo completo na interface com cliente: não há dados comerciais fornecidos para teste, e pedidos não podem ser gravados ainda.
- Permissões reais de gestor/vendedor: contas/sessões autorizadas não disponíveis; testes de domínio não substituem testes RLS.
- Logo e fotos oficiais MiMo não existem no projeto; PDF usa texto discreto MiMo, não logotipo inventado. Falta incorporar os arquivos oficiais.
- PDFs são gerados no navegador; não existe arquivo PDF persistente privado nem registro imutável específico de cada proposta emitida. Versões de documento de pedido são a base preparada, não uma implementação completa de arquivo de propostas.
- Configurações logísticas exibem os valores aprovados, porém cadastro editável de tipos de caixa/combinações ainda não foi implementado.
- Brindes manuais existem no pedido; catálogo próprio de brindes reutilizáveis ainda não foi implementado.
- Leituras atuais limitadas a 1.000 clientes/pedidos; paginação de grandes carteiras é pendente.
- Algoritmo automático aceita até 300 displays e 600 misturinhas; cargas maiores exigem distribuição manual.
- Não existe integração Jadlog, emissão fiscal, cobrança automática, estoque ou envio automático de mensagens.

## Arquivos
Criados: src/lib/mimo-pedido.ts, mimo-pedido.test.ts, mimo-pedido-flow.test.ts, mimo-pedido-db.ts, mimo-pedido.functions.ts, mimo-proposta.ts; src/components/mimo-tira-page.tsx, mimo-tira-config.tsx, mimo-pedido-editor.tsx, mimo-pedido-logistica.tsx; src/routes/_authenticated/mimo.tira-pedido.tsx; SQL preparado e este relatório.

Modificados: src/routes/_authenticated/mimo.tsx (somente menu), src/styles.css (tema local), AGENTS.md, roadmap.md, package.json e bun.lock (jsPDF). Nenhuma alteração no CRM pessoal, IA, webhook, autenticação ou indicadores antigos.

## Riscos remanescentes
Não tratar este estado como pronto para produção. Validar SQL/RLS em ambiente isolado e confirmar backup antes de aplicar. Após aplicação, executar verificações reais de autorização, concorrência e fluxo persistente. Não publicar antes de revisão explícita.
## Finalização segura (30/10) — código pronto, persistência bloqueada
- Regras novas: `src/lib/mimo-tira-regras.ts` (matriz de estados, permissões, cancelamento com motivo, versões, restauração, brindes, caixas, propostas, paginação, indicadores sem duplicação).
- Ações no servidor: listagem paginada, alterar estado/cancelar, restaurar versão, emitir/listar propostas; configurações com brindes e caixas.
- Bloqueio: toda gravação exige `MIMO_TIRA_PERSISTENCIA=ativa`, além das estruturas aplicadas.
- SQL revisado (NÃO aplicado): `docs/migracoes-preparadas/mimo-tira-pedido.sql`.
- Ativação: confirmar backup → aplicar SQL → criar armazenamento privado das propostas → ativar a chave → testar com admin, gestor e vendedor.
- Testes: 239 aprovados, 8 ignorados, 0 falhas. Persistência, RLS e concorrência ainda não testadas no banco.
