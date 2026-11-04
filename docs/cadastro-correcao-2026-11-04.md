# Cadastro ZapScout — 04/11/2026

Consulta somente de leitura em `public.security_logs`: em 03/11, das 17h57 às 17h59 (Brasília), ocorreram cinco bloqueios `signup_honeypot`; às 18h ocorreram três bloqueios `signup:ip`, pelo limite de três tentativas por hora. A mensagem relatada pelo usuário corresponde à recusa do honeypot. Os registros não provam qual navegador ou mecanismo preencheu o campo oculto.

O campo oculto `company` foi substituído por um campo com nome específico, contêiner `hidden` e indicações para gerenciadores de senha ignorarem. Nome, email e senha receberam atributos de preenchimento automático apropriados. A proteção do honeypot continua no servidor.

Limite por rede ampliado para 20 tentativas/hora; preservado o limite de duas tentativas/dia por email. Uma recusa por IP não consome mais a cota do email. Cadastro bloqueia envios concorrentes desde o precheck, trata exceções e libera o botão em `finally`. Se o serviço devolver uma sessão, navega diretamente ao aplicativo. Reenvio também se recupera de exceções.

Quatorze testes de regressão aprovados: falha do precheck com nova tentativa, envios concorrentes, recusa explícita, sessão imediata, campo oculto, falha de reenvio, limite de rede, limite de email, preservação da cota quando o IP está bloqueado, senha recusada com nova tentativa, conta existente, duplicata silenciosa, normalização do email e bloqueio do honeypot no servidor. Execução reproduzível: `npm run test:auth`, com configuração versionada em `vitest.auth.config.ts`.

TypeScript e lint dos arquivos alterados aprovados. Build validado por um processo Node que captura o código de saída diretamente, evitando que avisos em stderr sejam convertidos em falha pelo PowerShell.

Publicação autorizada pelo usuário após a validação. A verificação HTTP compara a página e os arquivos JavaScript publicados com a correção; a verificação do serviço executa somente o precheck (tentativa normal e honeypot preenchido), sem criar contas nem enviar emails. O acesso automatizado ao navegador esteve indisponível nesta sessão; os testes de interface usam o componente real com respostas do serviço simuladas. A entrega do email de confirmação não foi exercitada ponta a ponta.

As alterações MiMo anteriores já estavam em outro commit e não integram o diff desta correção. Nenhuma migração de banco é necessária.
