# Representantes comerciais MiMo — desempenho e comissão

Pedido do cliente: “Gestão Representantes Comerciais: acompanhamento de performance por representante (faturamento, clientes da carteira e % de comissão)”.

Página `/mimo/representantes-comerciais` (menu **Representantes comerciais**), separada da lista de candidatos de `/mimo/representantes` (formulário público), que continua igual.

## Decisões

- Representantes são **pessoas externas, sem login**. Não viram membros do painel.
- Comissão é um **percentual fixo por representante**, guardado em pontos-base inteiros (`comissao_bps`, 1% = 100; 3,5% = 350; 5% = 500).
- Território por **UF**. Uma UF pode ter um **principal** e secundários; um representante pode cobrir várias UFs.
- **Regra de atribuição** (definida pela liderança técnica):
  1. Cada cliente (unidade da carteira) recebe automaticamente o **principal ativo** da sua UF.
  2. A gestão pode **atribuir manualmente** outro representante a um cliente; a atribuição manual vence a regra da UF, exige motivo e fica no histórico. Voltar ao automático também é auditado.
  3. Secundários e representantes inativos não recebem clientes automaticamente (só por atribuição manual; inativos não podem ser escolhidos em novas atribuições).
  4. Cliente sem UF, ou cuja UF não tem principal ativo, aparece em **Sem representante**.
- Na planilha de origem, PR e SC têm dois representantes cada: a linha com `CONTAR UF = 1` é o principal, a com `0` é o secundário.

## Acesso

Somente **administrador** e **gestor** (comissão e faturamento são dados de gestão). A regra é repetida no menu (`PAGINAS_POR_PAPEL`), em cada função de servidor (`exigirMimo` + papel), na RLS de leitura das tabelas e dentro de cada RPC de escrita.

## Banco (migração preparada, **não aplicada**)

`docs/migracoes-preparadas/mimo-representantes-comerciais.sql` (somente ASCII; fora do journal do Drizzle):

- `mimo_rep_comerciais`: nome, chave normalizada (única por empresa), ativo, `comissao_bps`, telefone/e-mail/observações opcionais, `versao` otimista, autor/data.
- `mimo_rep_comerciais_territorios`: (empresa, UF, representante), `principal`, região/estado da planilha. Índice único parcial garante **no máximo um principal por UF**.
- `mimo_rep_comerciais_clientes`: atribuição manual por unidade da carteira (`representante_id` nulo = automático), motivo e `versao`.
- `mimo_rep_comerciais_historico`: append-only (gatilhos bloqueiam UPDATE/DELETE/TRUNCATE), registra antes/depois e ator de cada alteração e de cada importação.
- Leitura: RLS somente para administrador/gestor da empresa. Navegador não tem INSERT/UPDATE/DELETE.
- Escrita somente por RPCs `SECURITY DEFINER` que conferem empresa MiMo ativa e papel de gestão do chamador, travam o vínculo e serializam escritas da empresa (`pg_advisory_xact_lock`):
  - `mimo_rep_comercial_salvar` — cria/edita com versão otimista e substitui as UFs do representante; recusa nome duplicado e segundo principal na mesma UF.
  - `mimo_rep_comerciais_importar` — importação idempotente (abaixo).
  - `mimo_rep_comercial_cliente` — atribuição manual com motivo, versão otimista e representante ativo.

## Importação da planilha

Colunas: `REGIÃO | ESTADO | UF | REPRESENTANTE(S) | COMISSÕES % | CONTAR UF` (uma linha por representante e UF). Aceita `.xlsx` (lido no navegador com `read-excel-file`; usa a primeira aba que tenha o cabeçalho), `.csv` ou linhas coladas do Excel.

- Comissão: número menor que 1 é fração (0,035 → 3,5%); de 1 a 100 é percentual; `%` explícito é percentual. Valores que não cabem exatamente em pontos-base são recusados (sem arredondar).
- Pré-visualização obrigatória com erros (UF inválida, comissão inválida, mesmo representante com comissões diferentes, dois principais na UF, UF com vários representantes sem `CONTAR UF`) e avisos (UF sem representante, UF sem principal). Com erro, o botão de importar fica bloqueado.
- **Idempotente**: representante reconhecido pela chave do nome (sem acento/caixa/espaços extras); cria se não existir ou atualiza só a comissão. Para cada UF do arquivo, o conjunto de representantes passa a ser exatamente o da planilha; UFs ausentes do arquivo, situação ativo/inativo, contatos e atribuições manuais não mudam. Reimportar o mesmo conteúdo não altera dados (só registra a tentativa no histórico, com hash SHA-256 do conteúdo normalizado).
- A planilha real **não** está no repositório; os testes usam somente dados sintéticos.

## Desempenho

Filtro de período (padrão: mês atual até hoje; máximo 1 ano), datas comerciais `AAAA-MM-DD`.

- **Faturamento**: soma de `total` (centavos inteiros) dos pedidos da visão canônica segura `mimo_tira_pedidos_seguros` com estado **faturado/enviado/entregue** e **data de faturamento** (`documento.pagamento.faturadoEm`) dentro do período. Pedidos sem data de faturamento registrada não entram. São valores atuais do pedido, não recebimentos.
- Ligação pedido → cliente: o lead do pedido vinculado à unidade pela negociação da carteira (`mimo_carteira_negociacoes`). Nenhum valor é copiado para `mimo_leads`.
- Pedido cujas unidades vinculadas pertencem a **representantes diferentes** não é dividido nem duplicado: vai para Sem representante (“unidades de representantes diferentes”). Também vão para lá pedidos sem unidade da carteira e pedidos de unidades sem representante. A página mostra os motivos.
- **Clientes**: unidades da carteira atribuídas (todas, independentemente do período), com quantas são manuais; **clientes faturados**: unidades com pedido faturado no período.
- **Comissão** = faturamento do período × `comissao_bps` / 10000, calculada uma vez sobre o total do representante, em BigInt, arredondando meio centavo para cima. Sem ponto flutuante.
- Exportação CSV (`;`, BOM UTF-8) com proteção contra fórmulas igual à exportação de candidatos; inclui linhas Sem representante e Total.
- Limite de leitura: 20 mil registros por fonte; acima disso a consulta é recusada pedindo período menor.

## Testes

`node node_modules/vitest/vitest.mjs run --config vitest.representantes.config.ts --configLoader runner`

- `src/lib/mimo-representantes-comerciais.test.ts`: comissão em pontos-base, arredondamento, planilha (PR/SC com principal/secundário, erros e avisos, texto colado/CSV), atribuição (principal, manual, secundário, inativo, sem UF), desempenho e Sem representante, CSV, período e acesso por papel.
- `src/lib/mimo-representantes-comerciais-db.test.ts`: SQL preparado executado em PGlite — papéis, empresa, reimportação idempotente, troca de principal auditada, recusa de dois principais, versão otimista, atribuição manual com motivo, RLS e histórico imutável.
- `src/components/mimo-representantes-comerciais-page.test.tsx`: tabela de desempenho, importação colada, bloqueio com erros, atribuição manual e cadastro.

## Para liberar

1. Backup confirmado do banco compartilhado e aplicação da migração preparada pelo migrador oficial (não foi aplicada nesta entrega).
2. Abrir **Representantes comerciais → Importar planilha**, enviar a planilha real, conferir a pré-visualização (principais de PR e SC) e importar.
3. Conferir na aba **Clientes** os casos “Sem representante” (unidades sem UF) e fazer atribuições manuais quando necessário.
