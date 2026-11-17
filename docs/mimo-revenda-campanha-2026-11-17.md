# MiMo — proposta de campanha de revenda

Aprovado pelo proprietário: anúncio → formulário no ZapScout → atendimento MiMo no WhatsApp final 0424. Pedido inicial mínimo de R$ 1.500. Representantes seguem para `/representantes`; interessados que não confirmam o mínimo não seguem para o atendimento comercial. Estar começando ou vender pela internet não desqualifica. O prazo de compra organiza o atendimento, sem excluir automaticamente quem ainda pesquisa.

Destino proposto: `https://zapscout.com.br/revenda`. Perguntas: interesse, canal de revenda, cidade/UF, aceite do mínimo, prazo, nome, WhatsApp e autorização para contato relativo à solicitação. O formulário só oferece o WhatsApp após confirmação de gravação; a mensagem preparada leva as respostas e pede um consultor. O visitante ainda precisa enviá-la no WhatsApp.

No painel MiMo, as fichas aparecem no contexto do lead. Envios repetidos não sobrescrevem cadastro, responsável, etapa ou valores de pedidos. O mínimo é uma declaração de intenção, não valor de pedido nem aprovação de crédito. A origem informada na URL não é prova de atribuição de venda.

## Configuração para aprovar antes de criar/ativar na Meta

- Nome: `MiMo | Revenda | Formulário | Mínimo 1500`.
- Objetivo proposto: Leads; local de conversão: site.
- URL de anúncio: `https://zapscout.com.br/revenda?utm_source=meta&utm_campaign=revenda_1500&utm_content={{ad.id}}`.
- Público proposto: adultos nas regiões comerciais que o proprietário aprovar; evitar filtros demográficos usados como substituto de capacidade de compra. A intenção de compra e o mínimo serão explícitos no anúncio e no formulário.
- Texto proposto: “Quer comprar MiMo para revender? Pedido inicial a partir de R$ 1.500. Conte onde pretende vender e converse com nossa equipe para conhecer as condições.”
- Título proposto: “Revenda MiMo · a partir de R$ 1.500”.
- Botão proposto: Saiba mais.
- Orçamento, regiões, período, conta de anúncios, Página/Instagram e peças: ainda pendentes de escolha/aprovação.
- Mensuração: confirmar Pixel/conjunto de dados existente e configurar evento de lead somente após gravação aceita, com deduplicação. Não lançar campanha otimizada para conversão sem validar esse sinal. Não enviar respostas do formulário, valores ou nomes em parâmetros de URL de atribuição/eventos.
- Avaliar custo por contato elegível, conversas iniciadas, propostas e pedidos pagos. Formulário enviado, clique no WhatsApp e venda são etapas distintas.

Nenhuma campanha foi criada ou ativada na Meta por esta implementação. A campanha será construída pausada após aprovar a configuração; ativação exige autorização explícita.

## Implementação e verificação

SQL aditivo preparado em `docs/migracoes-preparadas/mimo-revenda-formulario.sql`. Função de entrada do WhatsApp preserva o caminho anterior e acrescenta resolução de variantes do nono dígito apenas para contatos vinculados ao formulário. Sem alteração na recuperação de carrinho, envios automáticos ou modelo da IA.

Testes cobrem filtros na interface/API/banco, limites, idempotência, RLS, acesso de equipe, preservação de cadastro, variante de telefone e entrada/repetição do webhook. Antes de aplicar, verificar o backup disponível e salvar definição anterior da função de entrada; depois, testar a transação real com dados sintéticos e rollback.

