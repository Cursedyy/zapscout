# Operação comercial MiMo — liberação prevista para 19/11/2026

## Decisões confirmadas

- Sem apresentação: preparar uso real da equipe.
- Todos os vendedores ativos veem e editam os mesmos leads comerciais da MiMo. Responsável identifica quem acompanha cada lead e follow-up.
- Quatro linhas comerciais: uma de entrada e três de fechamento. Números e associações a pessoas ficam na configuração privada, sem dados reais no repositório.
- Avisos no painel e por WhatsApp ao responsável do follow-up; nenhuma mensagem automática ao cliente.
- Novos pedidos passam do Excel para o Tira-pedido do painel. Histórico de planilha exige conciliação separada.

## Estado real

Implementação preparada localmente; ainda não liberada em produção. O Lovable bloqueou novas alterações por falta de créditos após o commit intermediário 7720fa7688d39e449c0fc4f40fd4340e30482dd0. Correções posteriores e worker estão no checkout local. Nenhuma migração ou mudança operacional foi persistida; vínculos, avisos e publicação desta frente não foram ativados.

A inspeção inicial encontrou 148 leads (146 de WhatsApp sem responsável), um vínculo comercial ativo da entrada informada, nenhum evento com referência de anúncio na consulta e dois pedidos vinculados (rascunho e confirmado). Esses totais não conciliam vendas de Excel.

## Comportamento implementado

1. Acesso compartilhado em interface, servidor, RLS e funções de pedidos para o comercial ativo da empresa fixa. Custos, prioridade de gestão, membros e outras empresas seguem protegidos; carteira de unidades mantém suas próprias regras.
2. Contexto com origem, evidência registrada, últimos contatos e pedidos vinculados; atalho cria pedido com o lead selecionado. Conversão considera estados confirmados e primeira confirmação, separada dos fechamentos manuais. Paginação exata recusa apuração incompleta.
3. Follow-ups com responsável, agendamento em São Paulo, reagendamento/conclusão/cancelamento, histórico imutável, versão e retry idempotente. Painel distingue hoje, próximos e atrasados; falhas não viram contagem zero.
4. Instâncias adicionais independentes: reserva de criação, pareamento e confirmação de número ao vivo. Fechamento só associa contato a lead existente. Tipos antigos de instância são preservados.
5. Origem Meta somente com evidência admitida de entrada; nada reclassifica os 146 leads cegamente. Métricas CSV não criam leads. Identidades internas confirmadas são excluídas antes do piloto/agente.
6. Fila interna por follow-up/versão/responsável. Configuração e worker ficam pausados por padrão. Ativação define cutoff para prazos futuros; concluir/reagendar/pausar cancelam pendências. Verifica remetente ao vivo e autorização antes do envio; aceite ambíguo ou processo interrompido fica incerto, sem repetição automática.
7. Endpoint usa gate autenticado de cron. Worker exige MIMO_FOLLOW_AVISOS_WORKER=ativo e ativação individual no banco. Job preparado nasce inativo. Aceite pelo provedor não é comprovação de leitura ou entrega ao vendedor.

## Implantação pendente

Conferir histórico e evidência de backup recuperável antes do migrador oficial. Há registro anterior de backup verificado de 08/11. Este trabalho capturou definições e políticas em cache privado; não criou nem afirmou um novo backup completo. O banco e o journal seguem com 41 migrações.

Aplicar nesta ordem, como uma versão de aplicação, sem publicação intermediária:

1. docs/migracoes-preparadas/mimo-comercial-compartilhado.sql
2. docs/migracoes-preparadas/mimo-lead-followups.sql
3. docs/migracoes-preparadas/mimo-comercial-numeros-avisos.sql
4. docs/migracoes-preparadas/mimo-followup-avisos-worker.sql

O script operacional mimo-followup-avisos-agendamento.sql é separado, reutiliza transporte autenticado sem expor credencial e cria somente um job inativo. Conferir ausência de job conflitante. Registrar hashes/journal pelo fluxo oficial após aplicação verificada, sem reaplicar SQL.

## Verificação e limites

Logs e códigos de saída finais: .cache/comercial-final-*. Testes usam fixtures sintéticas e cobrem papéis/empresa, transições, cutoff, dedupe, reservas, aceite tardio, ambiguidade, interface, agentes e formulários públicos. Os quatro scripts também foram executados em subtransação no banco real e integralmente revertidos: tabelas novas ausentes, journal mantido em 41 migrações e worker sem privilégio de execução anônimo/autenticado. Não substitui pareamento físico ou homologação de vendedor em produção.

A primeira versão remota teve leitura autenticada em desktop/390px, sem gravações. A versão local final ainda precisa de homologação em navegador de produção. Confirmar também MIMO_TIRA_PERSISTENCIA na hospedagem; pedidos existentes não provam o estado atual do interruptor.

Liberação: sincronizar fonte local, aplicar migrações verificadas, publicar e conferir versão; parear/conferir três fechamentos e finalidade da entrada; configurar destinos privados; realizar aviso interno aceito e piloto como vendedor do lead ao pedido/conversão. Ativar worker/job após conferência. Envios aceitos ou em trânsito não podem ser recolhidos.

## Corte de Excel

Conferir telefone/CNPJ e referência externa antes de importar. Pedidos previamente identificados com cadastro de outra pessoa exigem correção da origem. Definir corte operacional e chave idempotente para eventual importação histórica. Até a conciliação, a conversão do painel representa os pedidos do Tira-pedido, sem somar automaticamente as planilhas.
