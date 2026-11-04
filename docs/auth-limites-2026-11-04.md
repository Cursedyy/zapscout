# Cadastro sem cotas e timeout de login de um minuto

Solicitação: remover os limites de tentativas do cadastro e manter os de login com timeout de um minuto.

- O precheck de cadastro mantém somente o honeypot. Não lê nem incrementa cotas de IP/email, inclusive quando existem contadores antigos esgotados.
- O login mantém os limites de cinco tentativas por IP e oito por email, agora em janelas de 60 segundos. As chaves usam o namespace `login:minute`, evitando herdar as janelas antigas de 15 minutos.
- O bloqueio por falhas de login mantém o limiar existente, mas a leitura efetiva expira em até 60 segundos desde `last_failed_at`, incluindo registros antigos com `locked_until` de até 24 horas. Registrar uma falha também devolve no máximo um minuto. A consulta não reinicia o relógio.
- O RPC existente continua sendo usado para registrar as falhas; a política de timeout do login é aplicada pelo módulo servidor. A recuperação de senha mantém o uso e a duração progressiva originais do RPC. Não é necessária migração nem limpeza dos registros existentes.
- CAPTCHA adaptativo e honeypot de login continuam presentes.

Validação: 23 testes em `npm run test:auth`, incluindo repetição do cadastro com cotas simuladas esgotadas, limites de login por IP/email, CAPTCHA, expiração exata de 60 segundos, bloqueios antigos e preservação da recuperação de senha. A alteração é nas regras da aplicação; não modifica a configuração de limites internos do Supabase Auth.
