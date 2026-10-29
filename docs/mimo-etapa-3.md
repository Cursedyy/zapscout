# MiMo — Etapa 3

## Entrega
- CRM exclusivo em `/mimo/leads`: pesquisa por empresa, contato e telefone; filtros de entrada, origem, perfil, etapa e responsável; paginação de 30 registros; cadastro, edição e histórico.
- Campos comerciais, qualificação, origem/campanha/anúncio, responsável, pedido/conversão e motivo de perda.
- Etapas Novo, Contato realizado, Em negociação, Pedido fechado e Perdido. Não bloqueia reaberturas ou saltos legítimos.
- Pedido fechado exige valor e data; perdido exige motivo. Conversão não pode preceder entrada nem ter data futura.
- Um lead por empresa/telefone normalizado, inclusive formatos brasileiros com/sem DDI. Sem telefone, registros distintos são permitidos. Reabertura não apaga pedido anterior; mudanças ficam auditadas. Exclusão não disponível.

## Segurança
- Novas tabelas `mimo_leads` e `mimo_lead_historico`, com UUID, datas timestamptz e RLS por empresa/vínculo ativo.
- Todos os membros ativos consultam leads e histórico. Administradores/gestores cadastram e editam todos; vendedores cadastram para si e editam somente seus atribuídos, sem reatribuição.
- Nenhuma escrita de histórico permitida a membros. Trigger registra cadastro e alterações na mesma transação.
- Funções autenticadas verificam empresa fixa `mimo` e vínculo independentemente da tela, usando o cliente do usuário. Empresa/autor não são aceitos do navegador.
- Identidade do registro imutável; responsável novo precisa ser membro ativo. Controle otimista por `updated_at` impede sobrescrita silenciosa.
- Nomes dos outros membros não são buscados nos perfis pessoais; aparecem como “Membro N · papel” com vínculo UUID correto. Próprio nome exibido normalmente.

## Preparação para relatórios
- Entrada, origem, qualificação, pedido/conversão e histórico permitem calcular geração, qualificação e conversão futuramente.
- CAC depende dos custos de aquisição e da definição de novo cliente, ainda não incluídos; não há Meta Ads, dashboard ou cálculos nesta etapa.

## Arquivos
- `drizzle/migrations/0008_mimo_leads_comerciais.sql` (gerado/aplicado pela ferramenta).
- `src/lib/mimo-leads.ts`, `mimo-leads.server.ts`, `mimo-leads.functions.ts`.
- `src/lib/mimo-leads.test.ts`, `mimo-leads.server.test.ts`.
- `src/components/mimo-leads-page.tsx`, `mimo-lead-editor.tsx`.
- `src/routes/_authenticated/mimo.leads.tsx`, `AGENTS.md`, `roadmap.md`, este relatório.
- Tipos do banco regenerados automaticamente.

## Validação
- 32 testes automatizados: regras comerciais/telefone/permissões, funções de gravação e testes existentes MiMo.
- Banco real: transação com ROLLBACK validou administrador, vendedor, gestor, externo, inativo e visitante; cadastro, edição, duplicidade normalizada, pedido, motivo de perda e histórico protegido. Vínculo temporário do teste não foi mantido.
- Conferência após transação: zero leads, zero históricos e somente o membro original; nenhum dado fictício persistido.
- Navegador com sessão real do administrador: listagem vazia, pesquisa, filtros, abertura de cadastro, campos condicionais e página em celular sem transbordamento; painel `/app` sem erros JavaScript observados. Visitante direcionado ao login.

## Pendências / limites
- Não foi gravado um lead pela interface nem verificada sua reabertura pela interface: não há lead real fornecido e a produção é compartilhada; respeitada a proibição de dados fictícios. Cadastro/edição/histórico foram exercitados no banco em transação desfeita e nas funções por testes automatizados.
- Gestor/vendedor/externo foram validados no banco, não na interface com sessões reais desses papéis.
- Publicação não realizada. Nenhuma Etapa 4 iniciada; páginas pessoais, webhook, IA e integrações intactos.