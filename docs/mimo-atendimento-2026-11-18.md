# Atendimento MiMo — 18/11/2026

Ajustes autorizados pelo responsável: primeiro follow-up após 40 minutos e segundo após 3 horas, ambos contados da última mensagem do cliente. Mantidas as barreiras de atendimento humano, qualificação/desqualificação, bloqueio, pausa, ativação e envio incerto. Uma nova resposta cancela a sequência de silêncio; no máximo dois lembretes por conversa. Registros anteriores à mudança não ganham um segundo envio retroativo.

A pré-qualificação comercial requer nome, estado explícito, ramo/interesse, uma mini sondagem SPIN baseada em falas literais e catálogo aprovado enviado com sucesso. Pedidos explícitos de atendimento humano, suporte e recusa continuam prioritários. Dados verificados do formulário antecipam a coleta básica, sem substituir sondagem e catálogo. Nenhum contato é qualificado automaticamente: o encaminhamento permanece pendente de revisão humana.

Áudios são transcritos pelo endpoint autenticado do provedor usando o ID da mensagem, sem buscar URLs fornecidas pelo cliente. Apenas a conversa reservada pode receber a transcrição; nova mensagem, pausa ou troca de atendimento invalidam a gravação. O texto aparece no histórico identificado como transcrição. A disponibilidade em produção depende da configuração de transcrição na instância UazAPI. Não há credenciais adicionadas ao repositório. Sem transcrição válida, mantém-se o encaminhamento seguro existente.

Falha de recebimento reproduzida em transação revertida: nome de perfil com um caractere provocava rejeição do cadastro inicial. A correção usa o telefone como nome inicial da empresa nesse caso, preservando o nome de contato. Isso não demonstra a causa do contato da captura: não foi localizado evento ou cadastro correspondente no sistema. Não foram reabertas conversas humanas nem enviadas mensagens de teste a clientes.

Migrações preparadas separadamente e aplicadas somente pelo migrador Drizzle após conferir backup e a versão das funções atuais. O snapshot privado permite recuperar as definições anteriores. Testes incluem os limites exatos dos prazos, resposta concorrente, bloqueios, catálogo, evidências de sondagem, escopo/permissões de áudio e nomes curtos.

