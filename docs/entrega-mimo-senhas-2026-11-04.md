# Entrega conjunta: preload MiMo e orientações de senha

Publicação de todas as alterações pendentes autorizada pelo usuário em 04/11/2026.

## Senhas

- Cadastro gratuito, definição de senha após compra e redefinição mostram as orientações junto ao campo: mínimo de oito caracteres; confirmação igual quando houver; senhas comuns ou identificadas como inseguras ainda podem ser recusadas pelo serviço.
- A interface distingue os requisitos verificáveis das dicas de combinar maiúsculas, minúsculas, números e símbolos. Não aumenta o mínimo para 12 e não acrescenta validação local obrigatória de categorias de caracteres.
- O erro real `Password is known to be weak and easy to guess, please choose a different one` é traduzido com a explicação de que comprimento suficiente não garante a aceitação de uma senha conhecida.
- Quando o provedor informa motivos estruturados (`length`, `characters`, `pwned`), a mensagem apresenta a orientação correspondente. O cadastro e a redefinição compartilham essa tradução.
- A lista local de requisitos só marca comprimento e confirmação como atendidos; não promete que a proteção remota aprovou a senha.
- Não altera senhas de usuários nem desativa verificações do provedor. O endpoint público de configurações foi consultado e não expõe os critérios de composição. Por isso a interface não apresenta categorias adicionais como exigências administrativas confirmadas.

Referência: [segurança de senhas no Supabase](https://supabase.com/docs/guides/auth/password-security). Critérios locais e regras do provedor são tratados separadamente.

## MiMo

Inclui a etapa de pré-carregamento e pesquisa descrita em [mimo-desempenho-pesquisa-2026-11-04.md](mimo-desempenho-pesquisa-2026-11-04.md): orçamento de dois destinos comerciais automáticos, dados por intenção, cache compartilhado, respeito à rede/visibilidade e cancelamento antes do logout. Configurações de consulta foram extraídas de componentes pesados.

## Verificação

Comandos de teste reproduzíveis:

- `npm run test:auth`: 31 testes, incluindo a recusa relatada e nova tentativa com uma alternativa.
- `npm run test:mimo-performance`: 36 testes, incluindo cache, rede, cancelamento e regressões de Carteira/Tira-pedido.
- TypeScript, lint das rotinas de autenticação/preload e build de produção.

A conferência em produção verifica a presença das orientações no HTML do cadastro e dos módulos de redefinição/preload nos arquivos publicados. Não troca senhas reais, cria contas ou envia emails.
