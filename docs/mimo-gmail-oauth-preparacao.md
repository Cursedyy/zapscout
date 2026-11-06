# Preparação OAuth do Gmail para a MiMo

O envio de e-mail da recuperação de carrinhos usará a Gmail API com escopo único de envio (`https://www.googleapis.com/auth/gmail.send`) e OAuth de servidor com acesso offline. A conexão deve validar que a conta autorizada é `matheusconsultor@mimoessepode.com`; tokens serão cifrados com AES-GCM e vinculados à empresa MiMo. O navegador nunca recebe tokens ou segredo OAuth.

## Cliente OAuth Web no Google Cloud

Depois de publicar o callback servidor `/api/public/mimo-gmail-oauth`, criar um ID do tipo **Aplicativo da Web** no Google Cloud Console. Usar como URI de redirecionamento autorizado exatamente:

`https://zapscout.com.br/api/public/mimo-gmail-oauth`

Habilitar a Gmail API no mesmo projeto Cloud. Solicitar somente `gmail.send`, além de `openid` e `email` para confirmar o remetente. Se o app de consentimento estiver restrito à organização Google Workspace, selecionar **Interno**; caso contrário, o Google poderá exigir configuração de público e verificação para o escopo sensível.

As credenciais do cliente e a chave AES de 32 bytes devem ser cadastradas diretamente como segredos do ambiente servidor da hospedagem. Nunca enviar esses valores por e-mail, WhatsApp, issue ou repositório.

## Estado

Esta preparação não conecta a conta nem envia mensagens. O teste só deve ser habilitado após o callback, armazenamento cifrado, validação do remetente e botão de autorização estarem publicados. A recuperação automática permanece desativada enquanto fila idempotente, supressão de pedidos de parada e nova consulta canônica de pedidos antes do envio não estiverem implementadas.

## Implementação de 06/11/2026

### Diagnóstico do retorno OAuth

Após a configuração do cliente Web pela equipe, as tentativas observadas chegaram ao callback, consumiram o estado e foram finalizadas sem salvar credencial. O retorno passa a distinguir erros do Google, validação do remetente, expiração, cifra e persistência por uma lista fixa de motivos. Não retorna corpos Google, descrições externas, tokens ou códigos OAuth. Um cookie HttpOnly/Secure de dez minutos preserva somente esse motivo para a função de painel autenticada, mesmo se uma navegação de login remover a busca da URL. Esse cookie nunca comprova conexão: somente a credencial salva no banco autoriza mostrar “Gmail autorizado”. Iniciar uma nova conexão limpa o resultado anterior; callbacks inválidos/repetidos continuam sem finalizar outras tentativas. A causa específica das tentativas anteriores não foi registrada e exige nova autorização após publicar esse diagnóstico. Nenhum disparo de e-mail é ativado por essa alteração.

Interface e endpoints publicados no commit `24a180951348edef91a456967090a5f8aca44603`, deployment `97782d8b-edea-4d88-b81e-0ba8a15392e1`. Verificação pública às 09h27 de Brasília: HTTP 200 e controles de conexão/teste/envio manual no novo bundle; código de credenciais e RPCs de serviço ausente dos bundles inspecionados. Callback devolve 503 enquanto os segredos Gmail não estão configurados; descadastro inválido devolve 400. Isso não representa autorização da conta nem envio de e-mail. A equipe abriu o Google Cloud com o remetente correto e está configurando o projeto, acompanhada por instruções, pois o controle do computador ficou indisponível mesmo após nova tentativa e reset.

Implementados o callback `/api/public/mimo-gmail-oauth`, a conexão em Automações, teste interno com destinatário informado explicitamente, ativação/pausa independente do WhatsApp, envio manual por carrinho e fila automática própria. Um e-mail por checkout, duas horas após a última atualização, 24 horas por dia. O automático mantém o corte de criação definido na primeira ativação; históricos elegíveis são manuais. Conectar/reautorizar pausa os e-mails e exige novo teste. O aceite do Gmail não confirma recebimento; o botão de ativação orienta a equipe a verificar a caixa de entrada/spam antes de prosseguir.

OAuth solicita somente `openid`, `email` e `https://www.googleapis.com/auth/gmail.send`. Usa state aleatório de uso único, cookie Secure/HttpOnly, PKCE S256, rate limit de início, expiração de dez minutos e nova checagem de acesso ao consumir/salvar. O callback só finaliza sua própria tentativa consumida; replay não libera estados. O refresh token é cifrado com AES-GCM e contexto empresa/remetente. Antes de enviar, a renovação consulta o UserInfo oficial e verifica e-mail confirmado e a mesma identidade Google. Tokens e dados da caixa não chegam ao navegador. Esta integração não lê respostas no Gmail.

O SQL preparado em `docs/migracoes-preparadas/mimo-recuperacao-email.sql` cria seis tabelas com RLS e acesso exclusivamente por RPC de serviço, com acesso gerencial conferido novamente no banco. Os registros de teste, fila e contadores não se misturam aos de WhatsApp. A fila reserva atomicamente, reconsulta pedidos canônicos antes do envio, confere a versão da credencial e bloqueia compras, descadastro e respostas de WhatsApp já conhecidas para o telefone. Falhas de aceite e reservas interrompidas ficam incertas, sem repetição automática. Nenhuma atribuição de receita é criada.

Cada e-mail ao cliente contém texto e HTML, `Reply-To` do remetente, `Message-ID`, link de descadastro assinado com HMAC e cabeçalhos `List-Unsubscribe`/`List-Unsubscribe-Post`. O link não contém o e-mail. GET mostra confirmação sem suprimir, evitando descadastro por scanners; POST válido grava supressão por empresa/e-mail e bloqueia outras reservas pendentes. A chave do descadastro é independente da cifra e permanece necessária mesmo se o OAuth for removido. Preserve essa chave para manter válidos os links antigos.

### Configuração pendente no Google Cloud e hospedagem

1. Na conta que administra o Google Workspace, selecionar/criar o projeto Cloud da empresa e habilitar **Gmail API**. Configurar o consentimento, preferindo público **Interno** quando o projeto pertencer à organização Workspace. Se usar público Externo em teste, conferir as limitações de validade dos refresh tokens antes de operar continuamente.
2. Criar cliente OAuth **Aplicativo da Web**, nome `MiMo – Recuperação de carrinhos`, com o único URI de redirecionamento `https://zapscout.com.br/api/public/mimo-gmail-oauth`. Não é necessário adicionar origens JavaScript para este fluxo de servidor.
3. Cadastrar diretamente nos segredos do servidor da hospedagem, sem prefixo `VITE_`:
   - `MIMO_GMAIL_CLIENT_ID`: ID do cliente Web.
   - `MIMO_GMAIL_CLIENT_SECRET`: segredo do mesmo cliente.
   - `MIMO_GMAIL_SENDER`: `matheusconsultor@mimoessepode.com`.
   - `MIMO_GMAIL_TOKEN_KEY`: 32 bytes aleatórios em hexadecimal (64 caracteres).
   - `MIMO_GMAIL_UNSUBSCRIBE_KEY`: outros 32 bytes aleatórios em hexadecimal; diferente da chave anterior e estável ao longo do tempo.
   - `MIMO_GMAIL_EMPRESA_ID` e `MIMO_GMAIL_ORIGIN`: podem ser explicitados; quando ausentes, o servidor reutiliza os valores já configurados de `MIMO_NUVEMSHOP_EMPRESA_ID` e `MIMO_NUVEMSHOP_ORIGIN`.
4. Publicar os segredos, abrir `/mimo/automacoes` no domínio configurado e usar **Conectar Gmail** com a conta remetente exata. Autorizar no próprio navegador.
5. Informar um e-mail da equipe e enviar o teste interno. O exemplo usa um carrinho da página e vai somente ao destinatário indicado. Conferir recebimento/spam; depois usar **Recebi o teste; ativar e-mails**. O envio manual aos clientes também exige o teste aceito.

Nenhum cliente OAuth existia quando a equipe confirmou a preparação nesta sessão. A criação/configuração no Google Cloud e a autorização efetiva da conta continuam pendentes. Não enviar segredos por chat nem persistir valores em arquivos públicos. Referências: [OAuth de servidor](https://developers.google.com/identity/protocols/oauth2/web-server), [envio de mensagens Gmail](https://developers.google.com/workspace/gmail/api/guides/sending), [identidade Google](https://developers.google.com/identity/openid-connect/openid-connect).

Migração `0030_mimo_recuperacao_email` aplicada pelo migrador Drizzle pg-proxy após o backup já confirmado nesta sessão. Transporte UTF-8 conferido e 30 hashes/timestamps anteriores validados sob lock do journal, sem alterar registros comerciais existentes. Hash: `4032020e99e4feb559912c90966a876dce5fa3bcca8ef15391f13fb844c1eaac`. Conferência independente: 31 migrações, seis tabelas com RLS, nenhuma leitura/escrita direta de navegador, reserva exclusiva de serviço, nenhuma credencial Gmail e nenhuma fila de e-mail real. Validação local: 147 testes aprovados, incluindo banco PostgreSQL isolado com rollback integral, OAuth, cifras, identidade, descadastro, MIME, funções autenticadas e interface; tipos e lint de produção aprovados. Nenhum teste real de Gmail foi enviado.
