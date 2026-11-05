# Plano de implementação da MiMo

Este arquivo registra os requisitos e as decisões informados para planejar as próximas melhorias da MiMo. É o ponto de retomada para a próxima sessão.

## Diretriz de experiência

- Manter a ferramenta simples e fácil de usar, sem sobrecarregar o painel com informações, campos ou menus.
- Colocar cada ação na tela em que a equipe já realiza o trabalho. Usar listas curtas, resumos e detalhes sob demanda.
- Reaproveitar Carteira, histórico de pedidos e áreas de automação existentes antes de criar novas seções.
- Distinguir requisitos aprovados de ideias opcionais e de integrações que ainda dependem de informação ou acesso.

## Itens solicitados para planejar

### Consulta de crédito por CPF ou CNPJ

**Objetivo:** disponibilizar no painel MiMo uma consulta útil quando a equipe precisar, reduzindo ou eliminando o custo atual informado de aproximadamente R$ 10 por pesquisa.

**Comportamento desejado:** iniciar pela ficha do cliente e apresentar um resultado claro, data da consulta e histórico de consultas. Preferir uma opção gratuita quando ela oferecer os dados necessários.

**Limite conhecido:** consulta cadastral gratuita de CNPJ não equivale a uma análise completa de crédito. Não prometer acesso gratuito a score, dívidas, restrições ou informações de terceiros sem confirmar cobertura, condições de uso e fonte.

**Confirmado em 05/11/2026:** a equipe consulta pelo Omie e precisa de score e revisão geral de risco. Uma alternativa somente cadastral não atende a esse requisito.

**Pendente:** verificar se a consulta utilizada no Omie oferece integração e quais dados, condições de acesso e custos estão disponíveis; detalhar a cobertura de risco antes de escolher uma alternativa.

### Recuperação de carrinhos abandonados

**Objetivo:** preparar a MiMo para recuperar carrinhos abandonados no site `mimoessepode.com.br`, que usa Nuvemshop.

**Comportamento desejado:** receber os eventos e dados mínimos do carrinho, identificar a oportunidade no painel, iniciar o fluxo aprovado de recuperação e encerrar lembretes quando houver uma compra. Associar a recuperação ao pedido existente para medir conversões sem duplicar vendas.

**Pendente:** autorizar e configurar a conexão com a Nuvemshop; escolher canal, mensagens, intervalo, horário e regras de encerramento; confirmar os dados de contato disponíveis e o acesso técnico à loja.

### Resumo de reuniões do Google Meet

**Decisão registrada:** produzir um resumo automático depois da reunião, a partir da transcrição disponível. Não foi solicitado um agente que entre ao vivo.

**Resultado desejado:** pontos importantes, decisões, responsáveis e próximos passos, apresentados de forma enxuta e associados à reunião e, quando identificável, ao cliente ou oportunidade.

**Pendente:** identificar a conta Google a conectar e confirmar geração e acesso às transcrições, consentimentos, armazenamento e prazo de retenção. Sem transcrição acessível, a automação deve informar que não foi possível gerar o resumo.

### Lembrete de recompra

**Objetivo:** avisar o responsável pela conta quando o histórico de compras indicar que está se aproximando uma nova compra.

**Comportamento desejado:** mostrar o cliente, o último pedido e o motivo ou data que gerou o lembrete; permitir registrar o contato ou adiar o lembrete. Começar como sugestão à equipe. Só automatizar contato com cliente quando canal e conteúdo forem definidos.

**Pendente:** confirmar a disponibilidade e a qualidade de datas, itens e histórico de pedidos, além da regra para estimar recorrência. Não inventar uma frequência quando o histórico for insuficiente.

### Acompanhamento após entrega

**Objetivo:** acompanhar o cliente depois de receber o pedido.

**Comportamento desejado:** propor uma confirmação de recebimento, registrar problemas e criar o próximo contato ou ação para o responsável.

**Pendente:** determinar de onde virá a confirmação da entrega. Até existir fonte confiável, permitir confirmação ou agendamento manual; não inferir que o pedido foi entregue apenas por ter sido faturado ou expedido.

### Resultado das automações

**Objetivo:** mostrar se as automações geraram recuperação ou falhas que exigem atenção.

**Indicadores desejados:** carrinhos elegíveis, mensagens enviadas e falhas, carrinhos recuperados e pedidos e valores efetivamente associados às recuperações.

**Regra de contagem:** associar cada recuperação a um pedido real e evitar contagem dupla. Mostrar valores e totais como estimativas quando ainda não houver confirmação suficiente.

**Pendente:** definir janela de atribuição, estados dos pedidos que contam como conversão, fontes de eventos e métricas disponíveis na Nuvemshop e nos canais que forem escolhidos.

## Organização sugerida no painel

- **Carteira:** consulta de crédito, lembretes de recompra e acompanhamento pós-entrega dentro da ficha ou das ações do cliente.
- **Histórico do cliente:** resumo de reunião e próximos passos junto das atividades existentes.
- **Automações:** uma visão compacta de atividade, falhas e resultados de carrinhos recuperados.
- Priorizar alertas úteis e próximas ações. Exibir análises detalhadas sob demanda.

## Trabalho anterior e estado da Árvore Comercial

A **Árvore Comercial** já foi implementada e publicada em `/mimo/arvore-comercial`, com acesso de administração e gestão, cenários e cálculo de preços separado do Tira-pedido. A importação inicial da planilha com 114 registros foi disponibilizada em uma prévia revisável; é necessário que administração ou gestão confira e confirme a importação no painel. Custos reais permanecem em origem protegida, fora do repositório público.

Feedback registrado após visualizar a prévia: os valores de custo e preço exibidos com 12 casas decimais são difíceis de ler. Melhorar a apresentação com moeda arredondada a centavos, mantendo a precisão importada disponível nos detalhes ou na memória de cálculo. A diferença de custo do SKU M001 entre canais está corretamente sinalizada e deve ser preservada.

## Ideias sugeridas, ainda não aprovadas como requisitos

- Uma visão “Meu dia” com próximas atividades e clientes que precisam de retorno.
- Clientes sem próxima ação ou com atendimento atrasado.
- Resumo do cliente antes de um contato.
- Aprovação de condições comerciais especiais pela gestão.

Não adicionar essas ideias ao escopo de implementação sem priorização explícita.

## Próxima retomada

Primeiro confirmar as pendências de provedores e acessos. Em seguida, dividir as entregas em etapas pequenas: acabamento de leitura da Árvore Comercial; fundação e integração de eventos da Nuvemshop; lembretes baseados em dados verificáveis; resumos de transcrições do Meet; e, após confirmar a fonte de crédito, consultas com escopo e custo claros. Manter a navegação e as telas enxutas durante cada etapa.

## Retomada em 05/11/2026

- Acabamento da prévia da Árvore Comercial implementado localmente: custo, preço e comparação exibidos em BRL com centavos; valores originais disponíveis por linha em detalhes expansíveis. Dados de cálculo e alertas de divergência preservados.
- Suíte de pricing validada: 15 testes passaram. Integrações permanecem dependentes das informações e acessos listados acima.

### Restrição de custo confirmada em 05/11/2026

A consulta de score e revisão geral de risco deve ser gratuita, sem cobrança por pesquisa. Integração paga com Omie não atende. Pesquisa inicial não identificou fonte gratuita confirmada para consulta automatizada de score e risco de terceiros. Diferenciar consulta gratuita do próprio titular de acesso empresarial a terceiros. Consulta cadastral pública e análise do histórico interno são complementos e não substituem o relatório solicitado. Não implementar alternativa reduzida sem alinhamento.

## Outras frentes — continuidade em 05/11/2026

- Crédito e n8n adiados por solicitação explícita da equipe. Não avançar nessa frente nesta etapa.
- Carteira: atalhos de lembrete manual implementados junto de cada pedido em Negociações: “Lembrar recompra” e “Acompanhar entrega”. Abrem Atividades com número do pedido e objetivo preenchidos. Data é obrigatória e escolhida pela equipe; nenhum envio automático, confirmação de entrega ou estimativa de recorrência é produzido.
- Persistência, histórico, conclusão e reagendamento reutilizam as atividades e as permissões existentes. A referência ao pedido fica na descrição; ainda não existe associação estruturada nova para relatórios de automação.
- Validação: os cinco testes de interface da Carteira passaram, incluindo os dois novos fluxos e a garantia de que abrir um atalho não grava atividade antes da confirmação com prazo.
- Nuvemshop: conexão da loja e regras de recuperação permanecem pendentes; não enviar mensagens ou apresentar recuperações sem integração e atribuição confirmadas.
- Meet: conta Google e acesso a transcrições permanecem pendentes; resumo automático ainda não implementado.
- Próximas etapas: obter conexão da Nuvemshop e definir canal/horários/textos; conectar a conta Google com transcrições. Recompra automática exige histórico suficiente e regra aprovada. Entrega automática exige fonte confiável.

## Recuperação de carrinhos — início em 05/11/2026

A equipe priorizou esta frente e escolheu **WhatsApp e e-mail**. Primeira etapa implementada localmente: tela de recuperação em Automações, sincronização manual da API estável da Nuvemshop, armazenamento por empresa/loja e identificação de pedidos pelo token, sem atribuir receita ou realizar envios. Detalhes e checklist de ativação em `docs/mimo-recuperacao-carrinhos.md`.

Pendências de ativação: backup e aplicação da migração preparada; autorização da loja/aplicativo e configuração segura no servidor; homologação com dados reais. Pendências da segunda etapa: provedores, textos/horários/intervalos, processamento contínuo e fila segura, interrupção antes de cada envio, opt-out e atribuição. Não considerar recuperação automática concluída apenas com a primeira etapa.

## Situação da loja confirmada pela equipe

- Não existe aplicativo MiMo/ZapScout autorizado na Nuvemshop. O aplicativo desta integração ainda precisa ser criado; não pedir novamente à equipe que procure um aplicativo já existente.
- Os carrinhos abandonados aparecem no painel, com nome do cliente e e-mail.
- A opção de envio de e-mail da Nuvemshop é usada manualmente; não há envio automático nativo confirmado como ativo.
- Somente a conta do marketing possui acesso para administrar a loja e autorizar a instalação.
- A equipe também confirmou telefone nos detalhes dos carrinhos. Há contato informado para WhatsApp e e-mail; falta validar esses dados na API e a conexão comercial para envio.
- Próximo passo externo: criar o aplicativo no painel de parceiros/desenvolvedores da Nuvemshop, definir as URLs exigidas e escopo de leitura de pedidos, e solicitar que o marketing autorize a instalação na loja. Não compartilhar senha da conta de marketing nem tokens pelo chat.
- Fluxo de conexão OAuth implementado localmente: início por gestão, autorização da conta administradora da loja no mesmo navegador e retorno com validação de estado, empresa/loja e escopo. Token cifrado e acessível somente ao servidor. Cadastro externo do aplicativo, configuração, migrações, publicação e homologação continuam pendentes. Ver `docs/mimo-recuperacao-carrinhos.md`.

Atualização da conexão: aplicativo Nuvemshop criado com ID `50547`; origem confirmada `https://zapscout.com.br`; equipe confirmou URLs salvas. Client Secret e demais variáveis de produção ainda não configurados. Instalação não iniciada.

Migrações de carrinhos/OAuth aplicadas após confirmação do backup de 05/11/2026 11:37:13 UTC. Journal conferido com 25 registros e permissões verificadas. Seguem pendentes publicação, autorização da loja e homologação; nenhum envio foi ativado.
