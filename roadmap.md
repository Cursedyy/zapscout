# IA de Vendas — Gustavo

## MiMo — Etapa 3
- [ ] Criar leads e histórico exclusivos, com telefone normalizado e permissões por papel.
- [ ] Implementar cadastro, edição, pesquisa, filtros e histórico em /mimo/leads.
- [ ] Testar isolamento, permissões, duplicidade, histórico e fluxo real; documentar resultados sem iniciar Etapa 4.

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
