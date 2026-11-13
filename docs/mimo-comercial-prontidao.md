# Operação comercial MiMo — liberação prevista para 19/11/2026

## Decisões confirmadas

- Sem apresentação: preparar uso real da equipe.
- Todos os vendedores ativos veem e editam os mesmos leads comerciais da MiMo. Responsável identifica quem acompanha cada lead e follow-up.
- Quatro linhas comerciais: uma de entrada e três de fechamento. Números e associações a pessoas ficam na configuração privada, sem dados reais no repositório.
- Avisos no painel e por WhatsApp ao responsável do follow-up; nenhuma mensagem automática ao cliente.
- Novos pedidos passam do Excel para o Tira-pedido do painel. Histórico de planilha exige conciliação separada.

## Estado real

Código sincronizado pelo GitHub e nova interface observada no domínio de produção. A falta de créditos bloqueou o uso da IA do Lovable, mas a sincronização do repositório permitiu publicar as correções. PR #9 integrado em 5deb502c907c884305860391a7d483246cc0e1ca; registro das migrações em e15c4e498ab470d74b166e06290e6da9cc53026a. Deployment solicitado: 1d589ff8-4731-4ca6-ac00-2f8290d4955e. A nova tela autenticada de canais/avisos foi observada em produção. A operação completa ainda exige homologação do time.

As migrações 0041 a 0044 foram aplicadas em transação pelo fluxo Drizzle gerado, com conferência dos 41 hashes anteriores e definições alteradas. Banco e journal agora têm 45 migrações. A linha de entrada foi conferida ao vivo e sua finalidade registrada pela sessão autenticada do administrador. A primeira instância adicional foi criada; a conexão recebeu HTTP 429 com diagnóstico do provedor: Maximum number of instances connected reached. Não foram conectadas outras linhas nem desligadas conexões existentes.

Avisos continuam pausados: nenhuma configuração individual ativa, worker ainda pausado na hospedagem e job mimo-followups-internos criado inativo, com frequência de um minuto. Nenhum aviso de teste ou mensagem ao cliente foi enviado por esta implantação.

A inspeção inicial encontrou 148 leads (146 de WhatsApp sem responsável), um vínculo comercial ativo da entrada informada, nenhum evento com referência de anúncio na consulta e dois pedidos vinculados (rascunho e confirmado). Esses totais não conciliam vendas de Excel.

## Comportamento implementado

1. Acesso compartilhado em interface, servidor, RLS e funções de pedidos para o comercial ativo da empresa fixa. Custos, prioridade de gestão, membros e outras empresas seguem protegidos; carteira de unidades mantém suas próprias regras.
2. Contexto com origem, evidência registrada, últimos contatos e pedidos vinculados; atalho cria pedido com o lead selecionado. Conversão considera estados confirmados e primeira confirmação, separada dos fechamentos manuais. Paginação exata recusa apuração incompleta.
3. Follow-ups com responsável, agendamento em São Paulo, reagendamento/conclusão/cancelamento, histórico imutável, versão e retry idempotente. Painel distingue hoje, próximos e atrasados; falhas não viram contagem zero.
4. Instâncias adicionais independentes: reserva de criação, pareamento e confirmação de número ao vivo. Fechamento só associa contato a lead existente. Tipos antigos de instância são preservados.
5. Origem Meta somente com evidência admitida de entrada; nada reclassifica os 146 leads cegamente. Métricas CSV não criam leads. Identidades internas confirmadas são excluídas antes do piloto/agente.
6. Fila interna por follow-up/versão/responsável. Configuração e worker ficam pausados por padrão. Ativação define cutoff para prazos futuros; concluir/reagendar/pausar cancelam pendências. Verifica remetente ao vivo e autorização antes do envio; aceite ambíguo ou processo interrompido fica incerto, sem repetição automática.
7. Endpoint usa gate autenticado de cron. Worker exige MIMO_FOLLOW_AVISOS_WORKER=ativo e ativação individual no banco. Job preparado nasce inativo. Aceite pelo provedor não é comprovação de leitura ou entrega ao vendedor.

## Implantação e etapas restantes

Foi conferido o registro anterior de backup recuperável verificado de 08/11 e a correspondência dos 41 hashes antes da aplicação. Definições e políticas anteriores foram capturadas em cache privado; não se afirma um novo backup completo. O banco e o journal foram conferidos após aplicação com 45 migrações.

Ordem aplicada — não reaplicar:

1. docs/migracoes-preparadas/mimo-comercial-compartilhado.sql
2. docs/migracoes-preparadas/mimo-lead-followups.sql
3. docs/migracoes-preparadas/mimo-comercial-numeros-avisos.sql
4. docs/migracoes-preparadas/mimo-followup-avisos-worker.sql

O script operacional mimo-followup-avisos-agendamento.sql foi aplicado separadamente. Reutiliza transporte autenticado sem expor credencial; job conferido inativo. Não duplicar o job ou repetir a aplicação das migrações.

## Verificação e limites

Logs e códigos de saída finais: .cache/comercial-final-*. Testes usam fixtures sintéticas e cobrem papéis/empresa, transições, cutoff, dedupe, reservas, aceite tardio, ambiguidade, interface, agentes e formulários públicos. Os quatro scripts também foram executados em subtransação no banco real e integralmente revertidos: tabelas novas ausentes, journal mantido em 41 migrações e worker sem privilégio de execução anônimo/autenticado. Não substitui pareamento físico ou homologação de vendedor em produção.

A primeira versão remota teve leitura autenticada em desktop/390px, sem gravações. A versão publicada teve leitura autenticada de leads, follow-ups, contexto e canais comerciais; a finalidade da entrada foi salva e relida no banco. O papel real de vendedor foi exercitado no banco com leitura compartilhada e gravação/retry/conclusão de follow-up em subtransação revertida, sem registro fictício persistido. Ainda faltam piloto do vendedor pelo navegador, verificação móvel da versão final e confirmação do interruptor de persistência do Tira-pedido na hospedagem.

Liberação completa: resolver capacidade do provedor de WhatsApp, parear/conferir os três fechamentos, configurar destinos privados e realizar aviso interno aceito e piloto como vendedor do lead ao pedido/conversão. Ativar worker/job após conferência. Envios aceitos ou em trânsito não podem ser recolhidos.

CI remoto: Gitleaks e Trivy aprovados. Auditoria de dependências continua com os mesmos 17 avisos altos já existentes na versão anterior; manifestos e lockfile não foram alterados por esta frente. A pendência não foi resolvida nem ocultada e requer tratamento separado antes da liberação ampla.

## Corte de Excel

Conferir telefone/CNPJ e referência externa antes de importar. Pedidos previamente identificados com cadastro de outra pessoa exigem correção da origem. Definir corte operacional e chave idempotente para eventual importação histórica. Até a conciliação, a conversão do painel representa os pedidos do Tira-pedido, sem somar automaticamente as planilhas.
