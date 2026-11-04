# Retomada MiMo — 04/11/2026

Escopo recuperado da sessão de 03/11: manter o rascunho após sair ou reiniciar, antecipar o carregamento das telas, disponibilizar a conexão WhatsApp no painel MiMo e revisar funções que ainda não aparecem na interface.

## Disponível no código local

- Tira-pedido: salvamento automático local com AES-GCM; recuperação do documento e da aba ao reabrir; aviso para revisar rascunho de outra versão ou cliente; descarte explícito. Chave obtida após autorização no servidor e vinculada a empresa, usuário, papel, lead e pedido. O rascunho continua no mesmo navegador/perfil e não sincroniza entre dispositivos.
- Correção nesta retomada: voltar integralmente ao estado inicial remove o rascunho antigo e invalida gravações pendentes. Falhas no salvamento com alterações abertas também acionam o aviso de saída do navegador.
- Navegação: carregamento antecipado dos módulos das páginas permitidas, em sequência, sem executar relatórios ou consultas. Respeita economia de dados e conexões 2G. Indicador de navegação e estados de carregamento já integrados ao layout.
- Menu WhatsApp para administrador: pareamento por QR Code, consulta do número conectado, confirmação explícita da captura e pausa. Não ativa automaticamente números sem confirmação.
- Leads: aba WhatsApp com mensagens registradas, paginação e atalho para abrir o contato. Leituras permanecem autenticadas e limitadas pelo acesso ao lead e pelas políticas do banco.
- Recebimento: confere o número conectado com o vínculo confirmado antes da transação comercial; divergências não geram leads MiMo.

## Revisão do que falta na interface

- A conexão WhatsApp e o histórico por lead eram as lacunas encontradas que foram implementadas nas alterações locais retomadas.
- A fila geral de follow-ups e as metas mensais do roadmap ainda não têm páginas próprias. A Carteira já dispõe de atividades, agendamento e reagendamento por unidade.
- Sugestões de IA com aprovação para WhatsApp MiMo e integração Meta Marketing API continuam previstas no roadmap; não estão implementadas por este conjunto de alterações.
- Logo/fotos oficiais e validações com dados reais continuam sendo pendências descritas no roadmap.

## Validação e operação

- TypeScript sem erros.
- Build de produção concluído com código de saída 0, confirmado pelo processo Node sem a conversão de avisos de stderr do PowerShell. Log: `.cache/mimo-retomada-build.log`.
- 23 testes existentes aprovados para pedidos, frete e recebimento/webhook WhatsApp.
- 3 testes novos aprovados para recuperação sem memória da sessão, alterações desfeitas e descarte durante gravação pendente.
- Testes executados com `--configLoader runner`, pois o carregador padrão esbuild tenta listar a pasta pessoal, cujo acesso está negado neste ambiente.
- Pareamento de número real e recebimento de mensagem real ainda precisam de validação pela conta MiMo. Os testes locais não efetuam pareamento nem envio.
- Nenhuma publicação ou alteração do banco foi feita nesta retomada.
