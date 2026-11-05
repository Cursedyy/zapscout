# Recuperação de carrinhos MiMo — primeira etapa

Implementação local em 05/11/2026. Canal escolhido pela equipe: **WhatsApp e e-mail**.

## Entrega

- Tela `/mimo/automacoes`, restrita a administrador e gestor, com paginação de 30 carrinhos, contatos e itens sob demanda, última sincronização e erro visível.
- Sincronização manual, iniciada por botão, da API estável `2025-03`: carrinhos em `/checkouts`, pedidos em `/orders`. Abrir a página não consulta a loja nem dispara mensagens.
- Pedidos são consultados por atualização nos últimos 31 dias. Carrinhos disponíveis no provedor cobrem até 30 dias. Um carrinho pode demorar até seis horas para aparecer.
- Vínculo explícito entre empresa MiMo e loja configurado no servidor. Token de API nunca é enviado ao navegador. Nenhum CPF/CNPJ, endereço ou payload bruto é persistido.
- Valores em centavos inteiros; moedas preservadas. Carrinho e pedido são associados somente pelo hash SHA-256 do token retornado pela API e pela mesma empresa/loja. Essa correspondência precisa ser validada com um checkout convertido real na homologação; não existe associação por nome, telefone ou e-mail.
- Estados de compra criada, pagamento confirmado, cancelamento e estorno separados. Qualquer pedido associado retira o link para retomar o checkout. Nenhum resultado é chamado de recuperação atribuída.
- SQL com RLS e RPC exclusiva de serviço, verificação de empresa ativa e ator autorizado sob lock, identidades únicas, controle pela data de origem e gravação atômica. Repetições não duplicam carrinhos nem pedidos; dados antigos não substituem estados mais recentes.
- Paginação de API limitada a 10.000 registros por recurso nesta etapa. Erros de autorização, limite, paginação ou validação abortam a coleta antes da gravação. Uma resposta vazia não apaga os registros anteriores nem comprova uma compra.

## Ativação pendente

1. Verificar backup compartilhado conforme `AGENTS.md` antes de aplicar, nessa ordem, `docs/migracoes-preparadas/mimo-carrinhos.sql` e `docs/migracoes-preparadas/mimo-carrinhos-oauth.sql` pela ferramenta de migração. As duas migrações foram aplicadas pelo migrador Drizzle após a confirmação do backup de 05/11/2026 às 11:37:13 UTC; os arquivos aplicados estão no journal como 0023 e 0024.
2. Criar o aplicativo no painel de parceiros da Nuvemshop, com escopo mínimo `read_orders`. Configurar o callback como `https://zapscout.com.br/api/public/nuvemshop-oauth` e as URLs de administração/preferências como `https://zapscout.com.br/mimo/automacoes`, além das demais URLs e informações exigidas pela plataforma. Usar o domínio HTTPS real aprovado, que precisa coincidir com `MIMO_NUVEMSHOP_ORIGIN`; não usar um domínio adivinhado. Aplicativo cadastrado pela equipe com App ID `50547`; a equipe confirmou que salvou as URLs em 05/11/2026. A permissão read_orders ainda precisa ser conferida antes da instalação.
3. Configurar os seguintes segredos/variáveis no servidor, nunca com prefixo `VITE_` e nunca em commit:
   - `MIMO_NUVEMSHOP_EMPRESA_ID`: UUID da empresa MiMo existente.
   - `MIMO_NUVEMSHOP_STORE_ID`: ID esperado da loja MiMo, confirmado com quem administra a loja antes de iniciar. Uma autorização de outra loja é recusada.
   - Para o fluxo de conexão: `MIMO_NUVEMSHOP_APP_ID`, `MIMO_NUVEMSHOP_APP_SECRET`, `MIMO_NUVEMSHOP_ORIGIN` (origem HTTPS publicada, sem caminho), `MIMO_NUVEMSHOP_TOKEN_KEY` (chave aleatória criptográfica de 32 bytes em 64 caracteres hexadecimais). Guardar e fazer backup dessa chave em gerenciador de segredos; não substituir sem plano de recifragem ou nova autorização.
   - `MIMO_NUVEMSHOP_ACCESS_TOKEN`: alternativa de configuração técnica manual, opcional quando se usa OAuth. Uma credencial OAuth salva tem prioridade.
   - `MIMO_NUVEMSHOP_USER_AGENT`: nome do aplicativo e contato técnico válido.
   - `MIMO_NUVEMSHOP_CHECKOUT_HOSTS`: lista separada por vírgulas de domínios de checkout verificados para a loja. Começar com `mimoessepode.com.br,www.mimoessepode.com.br`; adicionar domínio próprio da Nuvemshop apenas após verificá-lo. Somente URLs HTTPS de `/checkout/` nesses hosts são liberadas.
4. Publicar o código após as verificações de implantação. Em Automações, um administrador/gestor da MiMo inicia “Conectar Nuvemshop”; no mesmo navegador, o marketing entra na Nuvemshop e autoriza a loja. O login da loja não precisa ser compartilhado. O usuário que inicia no ZapScout precisa ter papel de administração/gestão na MiMo; esse papel é independente da conta administradora da loja.
5. Sincronizar em homologação, conferir um carrinho real e sua transformação em pedido, e então conferir pagamento/cancelamento/estorno. Os testes locais usam apenas dados sintéticos; nenhuma chamada à loja real foi feita.

## Próxima etapa — envio e processamento contínuo

**Ainda não implementados:** agenda periódica, webhooks de pedidos, fila de contatos, envio por WhatsApp/e-mail, regras de opt-out, configuração de mensagens e atribuição de recuperação. Não há envio automático ativo.

- Definir provedor/remetente de e-mail e confirmar a conexão comercial de WhatsApp a utilizar. Não reutilizar uma instância pessoal por inferência.
- Aprovar textos dos dois canais, intervalo após abandono, sequência e máximo de tentativas, dias/horários e encerramento. Verificar o envio nativo de recuperação da Nuvemshop para evitar contatos duplicados.
- Antes de implementar envio, definir uma fila durável com idempotência por carrinho/canal/etapa, reconsulta da compra imediatamente antes do envio, tratamento de opt-out, falhas e retomada segura. No estado atual, a lista por sincronização manual não fornece essa garantia de tempo real.
- Receber notificações de pedidos com verificação HMAC do corpo original, vínculo da loja e persistência em fila antes de responder; processar fora da requisição e reconciliar o estado canônico na API.
- Escolher janela de atribuição e estados elegíveis. Pagamento confirmado sozinho não significa venda gerada pela recuperação. Contar um pedido real uma única vez e sem alterar `mimo_leads.valor_pedido` ou `conversao_em`.
- Definir retenção e atendimento aos pedidos de exclusão/dados antes de ativar a integração em produção.

## Verificação local

Suíte dedicada: `node node_modules/vitest/vitest.mjs run --config vitest.carrinhos.config.ts --configLoader runner`.
Testes cobrem normalização e minimização de dados, moeda, URL, empresa/loja, permissão de leitura/gravação, uso do ator verificado, paginação, erros da API, rollback, repetição, ordem inversa dos estados e tela sem conexão/com compra/falha/sucesso.

## Referências oficiais

- [Carrinhos abandonados](https://tiendanube.github.io/api-documentation/resources/abandoned-checkout)
- [Pedidos](https://tiendanube.github.io/api-documentation/resources/order)
- [Autenticação](https://tiendanube.github.io/api-documentation/authentication)
- [Requisições e paginação](https://tiendanube.github.io/api-documentation/intro)
- [Webhooks e HMAC](https://tiendanube.github.io/api-documentation/resources/webhook)

Validação anterior à etapa OAuth: 21 testes, tipos e build aprovados. A etapa OAuth ampliou a suíte para 34 testes aprovados; TypeScript e build de produção concluíram com código 0. Não foram encontrados marcadores de token, segredo do aplicativo ou chave de criptografia no bundle público gerado. Sem aplicação de SQL, conexão à loja ou publicação.

## Situação da loja confirmada pela equipe

- O aplicativo foi criado no painel de parceiros com App ID `50547`. Ainda não há confirmação de instalação/autorização na loja.
- Os carrinhos abandonados aparecem no painel, com nome do cliente e e-mail.
- A opção de envio de e-mail da Nuvemshop é usada manualmente; não há envio automático nativo confirmado como ativo.
- Somente a conta do marketing possui acesso para administrar a loja e autorizar a instalação.
- A equipe confirmou que os carrinhos também exibem telefone. Nome, e-mail e telefone estão disponíveis no painel; ainda é necessário conferir os mesmos campos em uma resposta real da API e validar a conexão comercial de WhatsApp.
- Aplicativo criado e URLs salvas. O próximo passo externo, após publicar/configurar o servidor, é autorizar a instalação na loja pelo fluxo da MiMo. Não compartilhar senha da conta de marketing nem tokens pelo chat.
- Fluxo OAuth próprio implementado localmente: botão autenticado de conexão e callback público com state aleatório, hash persistido de uso único e expiração, cookie Secure/HttpOnly/SameSite=Lax vinculado ao navegador, origem fixa e verificação de loja/escopo. Token cifrado com AES-256-GCM, IV aleatório e contexto autenticado de empresa/loja; leitura/gravação apenas por RPC de serviço com ator autorizado. Estados são consumidos antes da troca de código e o ator é revalidado ao salvar. O fluxo real depende do cadastro/configuração e da implantação citados acima.

## Configuração pública confirmada

- `MIMO_NUVEMSHOP_APP_ID=50547`.
- `MIMO_NUVEMSHOP_ORIGIN=https://zapscout.com.br`.
- URLs do aplicativo e callback salvas pela equipe conforme acima.
- O Client Secret não foi recebido nem configurado neste ambiente. Configurá-lo diretamente no gerenciador de segredos da hospedagem, junto da chave de criptografia e dos demais parâmetros pendentes. Não copiar para documentação, commit ou conversa.
- Nenhuma alteração de produção foi feita nesta confirmação. Permanecem pendentes: conferir escopo, identificar/configurar a hospedagem, aplicar migrações após verificação do backup, publicar e então autorizar a loja.

## Segredos cadastrados pela equipe

A equipe confirmou o cadastro no Lovable de `MIMO_NUVEMSHOP_APP_ID` (50547), `MIMO_NUVEMSHOP_ORIGIN` (https://zapscout.com.br) e `MIMO_NUVEMSHOP_APP_SECRET`. O segredo não foi enviado na conversa nem lido pelo agente. A disponibilidade efetiva desses valores no runtime publicado ainda será validada.

Continuam pendentes: `MIMO_NUVEMSHOP_EMPRESA_ID`, `MIMO_NUVEMSHOP_STORE_ID`, `MIMO_NUVEMSHOP_USER_AGENT`, `MIMO_NUVEMSHOP_CHECKOUT_HOSTS` e `MIMO_NUVEMSHOP_TOKEN_KEY`, além de migrações, publicação e homologação. Não iniciar instalação fora do fluxo autenticado da MiMo, pois o callback exige estado e cookie gerados por esse fluxo.

Identificação verificada por leitura do projeto Lovable `20f307c2-3309-44e4-9aec-4535cdcee2be`: empresa ativa de slug mimo com UUID `77a38e94-3937-452f-a2d9-19572457b317`. Usar esse UUID em `MIMO_NUVEMSHOP_EMPRESA_ID`. Leitura apenas; nenhuma migração ou segredo foi alterado.

## Parâmetros complementares

A equipe confirmou o cadastro de empresa_id, checkout_hosts e user_agent no Lovable.
O caminho dos recursos públicos do site MiMo (`acdn-us.mitiendanube.com/stores/007/396/347/…`) indica o store_id candidato `7396347`. Essa é uma inferência pelos arquivos da vitrine e precisa ser validada no retorno da autorização da loja; não foi confirmado pela Admin API autenticada.
Chave de criptografia criada em arquivo local `.cache/mimo-nuvemshop-token-key.txt`, ignorado pelo Git, sem exibir seu conteúdo em ferramentas ou conversa. A equipe deve copiá-la diretamente para `MIMO_NUVEMSHOP_TOKEN_KEY` no Lovable. Não sobrescrever o arquivo nem a chave de produção sem verificar se já há credenciais cifradas.
O estado publicado do projeto consultado ainda aponta para o commit `b590137d8e00c41cd54d86e66cc11f80027388e6`; as alterações desta sessão continuam locais.

## Parâmetros concluídos e conferência do banco

A equipe confirmou cadastro de `MIMO_NUVEMSHOP_STORE_ID` e `MIMO_NUVEMSHOP_TOKEN_KEY` no Lovable. Todos os parâmetros solicitados foram informados como cadastrados; a injeção efetiva no runtime ainda não foi testada. Valores secretos não foram recuperados.
Leitura de information_schema confirmou que nenhuma das cinco tabelas mimo_nuvem existe no banco compartilhado. O journal Drizzle existe no schema drizzle. As duas migrações continuam preparadas e fora do journal, conforme AGENTS.md, até verificar o backup aplicável antes da execução pelo migrador. A referência anterior de backup em documentação é 03/11/2026 11:37:25 UTC; não foi verificado nesta sessão um backup atual concluído.

Backup concluído confirmado pela equipe: **05/11/2026 às 11:37:13 UTC**. Pré-requisito de backup do AGENTS.md atendido para a aplicação das migrações de carrinhos/OAuth.

## Aplicação das migrações

Backup de 05/11/2026 às 11:37:13 UTC confirmado pela equipe. Migrações `0023_mimo_nuvem_carrinhos` e `0024_mimo_nuvem_oauth` aplicadas via `drizzle-orm/pg-proxy/migrator`, com a API autenticada query_database apenas como transporte de um único bloco atômico. O lote usa advisory lock, trava do journal, conferência de todos os 23 hashes/timestamps anteriores e rejeição de objetos preexistentes.

A primeira tentativa foi abortada pela conferência do baseline antes de criar objetos: as primeiras migrações do checkout Windows tinham CRLF. Confirmado que os 18 hashes divergentes correspondem exatamente ao conteúdo LF do repositório; normalizados os arquivos locais, regenerado e retestado o lote. Nenhum registro do banco existente foi alterado para contornar a conferência.

Verificação independente após aplicar: journal com **25 registros**, cinco tabelas com **RLS ativa**, nenhuma escrita direta por authenticated, nenhuma leitura anônima, nenhum acesso de navegador às credenciais ou estados e cinco RPCs de integração exclusivas de service_role. O helper de autorização não é executável diretamente nem por service_role. Teste isolado do transporte confirmou rollback integral após falha ao final e bloqueio de repetição.

Hashes aplicados:
- 0023: `8b4cdd368978bf5e2d0af8c6040535ed2daf99eae7b6889e325427f6ad1e8b7f`.
- 0024: `4c9d2b4e72d280541ea8ef41532711844e1c1277dcd2222bad8f0ecb74018b02`.

Os oito parâmetros solicitados foram informados como cadastrados pela equipe. Disponibilidade dos segredos no runtime publicado ainda precisa ser validada; seu conteúdo não foi recuperado. Envios de WhatsApp/e-mail permanecem desativados. A autorização real e a sincronização dependem da publicação do código desta sessão.

## Publicação pendente por acesso

As verificações finais passaram: 34 testes de carrinhos/OAuth, 15 de pricing e cinco da Carteira, além de lint dos arquivos de produção, tipos e build. O banco está aplicado e verificado.
A publicação não foi executada: o ambiente não permite criar `.git/index.lock`, a conexão HTTPS local ao GitHub falhou e o conector GitHub recusou criar a árvore no repositório com HTTP 403 `Resource not accessible by integration`. O plugin GitHub está instalado e a leitura de main foi possível; não foi possível concluir o envio de escrita. Nenhuma referência ou commit remoto foi criado por esta tentativa. É necessário um meio autorizado de escrita no repositório para sincronizar o código com o Lovable antes da publicação.

## Retomada de publicação em 05/11/2026

O acesso de escrita pelo conector GitHub voltou a funcionar. Código enviado para main no commit `10a76dd9c290a1de837a271442916f0954f94195`, preservando o pai `b590137d8e00c41cd54d86e66cc11f80027388e6`. Lovable confirmou latest_commit_sha correspondente. Os 34 testes de carrinhos/OAuth passaram novamente.
Publicação solicitada pelo deploy_project: deployment_id `373e4d56-c2a5-4c03-a70d-f6fa278fa02e`, retorno `pending`, URL `https://zapscout.lovable.app`. O retorno ainda não confirma conclusão. Não repetir publicação sem conferir o estado no painel. A conexão HTTP local ao domínio e a leitura pelo buscador não permitiram validar o site nesta retomada.
Próximo passo: conferir conclusão da publicação no Lovable e abrir /mimo/automacoes com sessão de administrador/gestor para conectar a Nuvemshop. Ainda não houve autorização real da loja nem validação dos segredos no runtime. Envios automáticos permanecem desativados. O índice Git local continua sem permissão de escrita; não confundir o HEAD local antigo com a main remota atualizada.

## Diagnóstico do retorno de autorização em 05/11/2026

Publicação confirmada pela equipe. Primeira tentativa registrada às 15:03:43 UTC e consumida no callback às 15:03:52 UTC, sem finalização. Isso confirma validação de navegador/estado e consumo no banco; não distingue falha na troca do código, loja/escopo, criptografia ou persistência. Não atribuir causa sem evidência. Novas tentativas durante a reserva de dez minutos são bloqueadas pelo RPC.
Correção adiciona motivos fixos e seguros no retorno, mensagens para loja divergente, escopo, código recusado, provedor indisponível e falha ao salvar, sem incluir corpo da API, código, token ou segredo. Início informa a reserva temporária e limite de tentativas. Mantidas as validações e a trava; nenhuma alteração no banco ou envio de mensagens. Validação: 38 testes de carrinhos/OAuth aprovados. Após publicar, iniciar nova autorização para identificar a causa concreta.

Diagnóstico enviado para main no commit c731992b631c92ba6e9d0b10069ca91b9b36bf17 e reconhecido pelo Lovable. Tipos, lint de produção, 38 testes e build aprovados. Publicação solicitada: deployment_id 33f9f771-be16-4bee-9e6e-a672a9ed5f8e, retorno pending. A equipe deve aguardar essa publicação antes de refazer a autorização e informar a mensagem específica resultante. Não há confirmação da causa raiz nem de conexão concluída.

## Comunicação com o provedor — 05/11/2026

A equipe retornou motivo=provedor_indisponivel. Estado criado 16:01:19 UTC e consumido 16:01:29 UTC; sem credencial salva. O motivo anterior agrupava falhas de rede, timeout e HTTP fora de 400/401; portanto não confirma indisponibilidade da Nuvemshop nem segredo incorreto.
Transporte ajustado para incluir User-Agent configurado e Accept JSON, com redirecionamentos manuais limitados a dois saltos HTTPS entre www.nuvemshop.com.br e www.tiendanube.com exclusivamente no caminho /apps/authorize/token, sem credenciais na URL, query ou fragmento. Mantido POST e corpo somente nesses destinos oficiais, prazo total de 15 segundos e ausência de repetição automática após erro de rede/código possivelmente consumido. Mensagens distinguem rede, timeout, HTTP 403, HTTP 429 e redirecionamento recusado. Nenhuma validação de empresa, loja, escopo, cookie ou estado foi relaxada.
Os endpoints são equivalentes segundo https://nuvemshop.dev/en-US/api/authentication. Sondagem local sem credenciais não foi possível por bloqueio de rede do ambiente; não usar isso como evidência sobre a hospedagem. Causa raiz de produção ainda depende de retorno real após o ajuste.

Ajuste de transporte enviado para main em 10d14494eaba7a349a593cc5df1df4cce983dcca e reconhecido pelo Lovable. Validação aprovada: 48 testes, TypeScript, lint dos arquivos de produção alterados e build (código 0). Publicação solicitada, retorno pending: 9f7aeecf-f4c1-4075-8667-d9a54e0770ad. Não houve novo OAuth real nem confirmação de conexão; aguardar publicação e realizar nova autorização pelo navegador autenticado.

## Liberação imediata após falha de autorização — 05/11/2026

Pedido da equipe: remover a espera de dez minutos depois de uma falha confirmada. Callback mantém o contexto somente após consumir validamente seu próprio estado; em falha de troca/validação/cifra/gravação, chama mimo_nuvem_oauth_falhar para expirar somente esse hash, empresa, loja e ator. Consumo é preservado: estado não pode ser reutilizado nem receber gravação tardia. Callback inválido ou repetido não libera reserva; callback antigo não interfere no novo; credencial concluída não é alterada. Em erro da liberação, a tela informa que não houve confirmação e mantém a proteção por expiração.

Migração 0025_mimo_nuvem_oauth_liberar_falha aplicada pelo migrador oficial Drizzle pg-proxy, usando a API query_database apenas como transporte atômico. Backup recuperável já confirmado nesta sessão: 05/11/2026 11:37:13 UTC. Lote conferiu todos os 25 hashes/timestamps anteriores sob lock de journal e advisory lock. Teste isolado confirmou rollback integral após falha ao final e rejeição de reaplicação. Verificação independente: 26 migrações; nova RPC permitida a service_role e negada a authenticated/anon. Hash novo: bbcfe7b2960e5ce72d07d384eb6809767c2cac7af827cf95089948b05fd40ff5.

Validação: 51 testes passaram, cobrindo nova tentativa imediata após falha, bloqueio enquanto outra processa, ator/loja divergente, reuso e save tardio negados, idempotência, retorno antigo sem cancelar tentativa nova, sucesso preservado e permissões. Limite antiabuso de cinco tentativas em dez minutos permanece. Nenhum token, código ou segredo foi recuperado; envios permanecem desativados. Publicação do callback atualizado é necessária para ativar a liberação automática; tentativas antigas sem esse código continuam sujeitas à expiração normal.

Código de liberação enviado para main em 47d2521c127e14d3da5f5a69714cdf8c345fcfbf e reconhecido pelo Lovable. 51 testes, tipos, lint e build aprovados. Publicação solicitada: deployment_id 4b7a3d65-19fa-46c2-b4ff-0f1f8e50678e, retorno pending. Banco aplicado e permissões verificadas. Ainda não houve nova autorização real da loja nesta etapa.

## Loja conectada e consulta inicial à API — 05/11/2026

A equipe concluiu OAuth; consulta de metadados confirmou credencial presente sem ler o conteúdo. Não existe sincronização concluída. Screenshot mostrou erro capturado pelo fetch da consulta API (pode ser rede, timeout ou redirecionamento rejeitado; não confirma HTTP 401/403).
Consulta usa agora api.tiendanube.com como endpoint principal documentado, com alias api.nuvemshop.com.br após falha imediata de rede em GET. Redirecionamentos manuais limitados a dois saltos somente entre esses hosts HTTPS, preservando exatamente versão, loja, recurso e query (campos/filtros/página). Credencial continua apenas no cabeçalho; nenhum destino de checkout é aceito. Prazo total permanece 15 segundos por página, sem repetir respostas HTTP de autenticação; falha deixa lote inteiro sem gravação.
61 testes aprovados, incluindo redirects oficiais, rejeição de troca de host/loja/filtros/protocolo/credenciais, alias após erro de rede, limites de tentativas e preservação da paginação. Conexão salva permanece válida; após publicar esta versão, usar Sincronizar loja, sem reautorizar.
Referência oficial: https://tiendanube.github.io/api-documentation/intro e https://nuvemshop.dev/en-US/api/getting-started. Homologação com consulta real ainda pendente.

Transporte da consulta enviado para main em 1b8c00cb7205e07db5ada99763d36e317d12d17d e reconhecido pelo Lovable. 61 testes, tipos, lint e build (código 0) aprovados. Publicação solicitada nesta retomada. Conexão confirmada por metadados; sincronização real ainda requer ação autenticada no painel após a implantação. Não foi necessário reautorizar nem alterar banco ou credenciais.

## Primeira regra de recuperação — definições em andamento

Equipe autorizou preparar o fluxo e pedir as informações necessárias. Confirmado: espera de duas horas; todos os dias; janela 9h inclusivo a 18h exclusivo em America/Sao_Paulo; um lembrete por WhatsApp e outro por e-mail quando ambos os contatos estiverem disponíveis. A equipe alterou a proposta inicial sem desconto: usar sempre cupom MIMOCONSULTOR com 10%, confirmado como já ativo na loja. Solicitou criação de textos com identidade visual MiMo.

Preparada prévia puramente informativa no painel: duas horas a partir da última atualização conhecida, movendo para as 9h seguintes quando fora da janela; compra registrada, falta de contato/link seguro, datas inválidas/futuras e registros fora da janela de 30 dias não apresentam horário. Carrinhos existentes não foram inseridos em fila. Ativação futura deve ter início explícito, evitando contato retroativo com histórico. Prévia não é elegibilidade final: envio exigirá rechecagem canônica de compra, supressões, canal confirmado e dedupe durável.

Consulta confirmou 13 carrinhos sincronizados e nenhum vínculo de WhatsApp comercial MiMo. Não foi localizado transporte de e-mail no código. Remetente e telefone recebidos foram guardados somente em arquivo local ignorado pelo Git; número informado requer confirmação dos nove dígitos após DDD. Pendentes: número completo, contatos da equipe para teste, conexão do Google Workspace/Gmail, revisão dos textos/assunto e aprovação do piloto. Não gravar destinatários pessoais nem credenciais no repositório público.

76 testes de carrinhos/OAuth/horários aprovados. Nenhuma mensagem foi enviada, nenhum job de disparo ativado e nenhuma fila real populada nesta etapa.

Modelos criados para revisão: WhatsApp acolhedor com cupom/link e instrução SAIR; e-mail com assunto, versão texto e HTML responsivo nas cores MiMo (#FFFCF7, #FC6C12, #612808), cupom em destaque e CTA de retomar carrinho. Sem urgência, validade ou regras comerciais inventadas. Prévia usa apenas identidade e link sintéticos; sem imagens remotas ou rastreamento. Descadastro aparece como pendência na prévia; nenhum envio deve usar o modelo sem link assinado e supressão persistente implementados.

Confirmado Google Workspace/Gmail como serviço da caixa remetente. A equipe informou número remetente e destinatário de teste, registrados somente no arquivo local ignorado. A conexão comercial ainda deve ser pareada e ter identidade conferida pelo provedor; não adivinhar dígito de telefone. E-mail destinatário de teste ainda não confirmado explicitamente. 80 testes aprovados para carrinhos, OAuth, horários e modelos.
