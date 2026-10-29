# IA de Vendas — Gustavo

## MiMo — Etapa 6
- [x] Dashboard com 8 indicadores, filtros, gráficos, campanhas, avisos e permissões; 9 testes; docs/mimo-etapa-6.md.
- [ ] Conferir com dados reais: aguarda leads e CSV reais da MiMo.

## MiMo — Etapa 5
- [x] Importar CSV do Meta Ads com prévia, validação, deduplicação, histórico e permissões; 9 testes + banco + prévia verificados; docs/mimo-etapa-5.md.
- [ ] Confirmar importação real pela tela: aguarda CSV real da MiMo.

## MiMo — Etapa 4
- [x] Preparar vínculo explícito do WhatsApp comercial e recebimento idempotente isolado.
- [x] Integrar ao webhook sem mudar o processamento atual de outras contas; registrar diagnóstico seguro.
- [x] Executar 48 testes, validar transação real desfeita, isolamento, campos comerciais e endpoint não autorizado; documentar em docs/mimo-etapa-4.md.
- [ ] Ativar vínculo e testar mensagem real: aguarda número comercial e conta conectada confirmados pelo usuário.

## MiMo — Etapa 3
- [x] Criar leads e histórico exclusivos, com telefone normalizado e permissões por papel.
- [x] Implementar cadastro, edição, pesquisa, filtros e histórico em /mimo/leads.
- [x] Executar 32 testes, validar banco com transação desfeita, conferir listagem/cadastro/filtros com administrador e visitante, documentar em docs/mimo-etapa-3.md.
- [ ] Validar gravação/reabertura/histórico pela interface com um lead real fornecido: não criar dados fictícios na produção compartilhada.

## MiMo — Etapa 2
- [x] Criar área exclusiva, navegação e estados vazios, reutilizando autenticação e identidade visual.
- [x] Validar vínculo ativo no servidor e proteger todas as páginas MiMo.
- [x] Executar 12 testes automatizados; verificar administrador, visitante, navegação e painel atual na aplicação; verificar helper de vínculo inexistente no banco.
- [ ] Validar gestor, vendedor e usuário autenticado sem vínculo na aplicação real: não existem membros gestor/vendedor e não há sessão autorizada de uma conta sem vínculo disponível; não criar vínculos nem alterar papéis reais para testes.

- [x] Corrigir entrada de contatos novos na IA sem cadastro prévio no CRM (3 testes aprovados).
- [x] Verificar configuração de recebimento da instância do Gustavo (estava ausente; registrada e confirmada).
- [x] Testar salvamento na conta do Gustavo e abertura da aba de conversas; verificar cron ativo a cada 5 segundos.
- [ ] Confirmar entrega e exibição no WhatsApp: segunda resposta aceita pelo provedor em 27/10 às 14:42 UTC; aguarda confirmação do destinatário.
- [x] Adicionar e verificar lista de números excluídos das respostas automáticas da IA (testes aprovados; salvar, reabrir e remover verificados na conta autenticada).
- [x] Adicionar imagens e PDFs privados, gerenciamento e seleção por pedido; upload, reabertura, desativação e exclusão verificados, com testes aprovados.
- [ ] Confirmar envio real de catálogo e fotos no WhatsApp: depende da publicação e de um pedido real do cliente com anexos cadastrados.- [x] Escalar de verdade quando o cliente pede uma pessoa ou a IA promete encaminhar; responsáveis por assunto; "digitando"; tom sem emojis/travessões (testes aprovados).
- [ ] Confirmar no WhatsApp real o "digitando" e o aviso chegando ao responsável certo: depende de publicar.

## MiMo — Etapa 7
- [x] Relatórios semanais, comparação, exportação CSV segura; 9 testes; docs/mimo-etapa-7.md.
- [ ] Validar com dados reais e com gestor/vendedor: aguarda dados e membros reais.

## MiMo — Etapa 8
- [x] Auditoria, testes integrados (191 automatizados, banco desfeito, navegador, 4 downloads), docs/mimo-etapa-8.md.
- [ ] Publicar: aguarda aprovação do usuário.
- [ ] Ativar WhatsApp MiMo, testar gestor/vendedor reais, validar com CSV e leads reais: aguardam dados/pessoas reais.

## Evolução comercial MiMo (documento de 29/10)
- [x] 1. Vendedor vê só os próprios leads no banco; agregados da equipe sem registros individuais
- [x] 1b. Tela de membros (convite, desativação, reatribuição) e registro de ações administrativas
- [ ] 2. Meta Marketing API + fila de revisão de leads (bloqueado: credenciais/permissões do app Meta)
- [ ] 3. WhatsApp MiMo: conversas, sugestões da IA com aprovação (bloqueado: número comercial)
- [ ] 4. CRM: motivos de perda padrão, duplicados, priorização sugerida
- [ ] 5. Fila de follow-ups com confirmação
- [ ] 6. Metas mensais com histórico e projeção
- [ ] 7. Relatórios ampliados
