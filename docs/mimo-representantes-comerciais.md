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

## Banco

`docs/migracoes-preparadas/mimo-representantes-comerciais.sql` (somente ASCII; fora do journal do Drizzle). Aplicada em produção após a entrega do PR #82; o faturamento pelo Omie **não** exige nova migração (nada do Omie é gravado no banco).

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

Filtro de período (padrão: mês atual até hoje; máximo 1 ano), datas comerciais `AAAA-MM-DD`. O período só é aplicado ao clicar em **Consultar** (evita uma consulta ao Omie a cada dígito da data).

A aba tem duas fontes de faturamento, escolhidas por um seletor:

1. **Omie (notas fiscais)** — padrão e fonte oficial dos números de destaque (faturamento, comissões, notas). O faturamento real da MiMo é emitido no Omie; os pedidos do painel cobrem só uma fração (em 2026, 2 pedidos faturados).
2. **Pedidos do painel** — visão secundária mantida para conferência, com a regra anterior (abaixo).

“Clientes na carteira” é igual nas duas fontes: unidades da carteira atribuídas (todas, independentemente do período), com quantas são manuais.

### Faturamento pelo Omie

Consulta ao vivo, **somente leitura**, pela mesma porta `chamarOmie` e lista `CHAMADAS_PERMITIDAS` do painel de inadimplência (`src/lib/mimo-inadimplencia.server.ts`; credenciais `OMIE_APP_KEY`, `OMIE_APP_SECRET`, `MIMO_OMIE_EMPRESA_ID`). Foram acrescentadas à lista apenas duas consultas:

| Endpoint | Chamada | Uso |
| --- | --- | --- |
| `produtos/nfconsultar/` | `ListarNF` | NF-e do período: `dEmiInicial`/`dEmiFinal` (dd/mm/aaaa), `tpNF: "1"` (saída), `filtrar_por_status: "N"` (não canceladas), `cApenasResumo: "S"` (sem itens), `registros_por_pagina: 100` (máximo da API) |
| `geral/clientes/` | `ListarClientes` | UF (`estado`) e `cnpj_cpf` dos clientes das notas, em lotes de 50 códigos (`clientesPorCodigo`) |
| `geral/clientes/` | `ConsultarCliente` (já permitida) | Somente para clientes que o lote não devolveu, até 100 por consulta |

Por que `ListarNF` e não `ListarPedidos`: a nota fiscal traz numa única resposta a **data de emissão** (`ide.dEmi`), o **valor total** (`total.ICMSTot.vNF`), o **cliente** (`nfDestInt.nCodCli` e `cnpj_cpf`) e a **situação fiscal** (`ide.dCan`, `ide.cDeneg`, `ide.dInut`, `ide.finNFe`, `ide.tpNF`). O pedido de venda não tem data nem situação fiscal confiáveis do faturamento (um pedido pode ser faturado parcialmente, devolvido ou ter a nota cancelada depois).

**Entra no faturamento** cada NF-e (`compl.nIdNF` sem repetição) que seja:

- de **saída** (`tpNF = 1`), de **finalidade normal** (`finNFe = 1`), não homologação (`tpAmb ≠ 2`);
- **não cancelada** (`dCan` vazio), **não denegada** (`cDeneg ≠ S`), **não inutilizada** (`dInut` vazio);
- com **emissão** (`dEmi`, data do Omie no horário de Brasília/São Paulo) dentro do período.

Valor = `vNF` (valor total da nota, incluindo frete, IPI/ST e descontos como destacados na nota), convertido para **centavos inteiros**. **Não entram**: notas de devolução (`finNFe = 4`), complementares (`2`) e de ajuste (`3`), notas de entrada; a página mostra quantas notas e quanto ficou fora por motivo. **Devoluções recebidas de clientes não são abatidas** (faturamento bruto emitido). Notas sem os campos obrigatórios são ignoradas com aviso (nunca completadas); se todas vierem assim, nada é calculado.

**Atribuição de cada nota** (pelo cliente do Omie):

1. **Atribuição manual vence**: se o CNPJ/CPF do destinatário da nota (ou do cadastro do cliente no Omie), só dígitos, for igual ao `cnpj` de uma unidade da carteira **com atribuição manual**, a nota vai para esse representante. CNPJ com 12–13 dígitos é completado com zeros à esquerda; outros tamanhos não casam. Se o mesmo documento estiver em unidades com representantes manuais **diferentes**, a nota vai para Sem representante (“atribuições manuais diferentes”), sem dividir.
2. Senão, **UF do cadastro do cliente no Omie** (`estado`) → **principal ativo** dessa UF (secundários e inativos não recebem automaticamente).
3. Senão, **Sem representante** com motivo: cliente sem UF válida (vazia ou `EX`), UF sem principal ativo, ou cliente do Omie que não pôde ser consultado (aviso na página).

A UF da unidade da carteira **não** é usada para notas do Omie: vale o cadastro do Omie. Clientes cujo documento já casou com uma atribuição manual não são consultados (economiza chamadas).

**Números**: faturamento por representante = soma das notas; **clientes Omie faturados** = códigos de cliente distintos com nota no período; **comissão** = total do período × `comissao_bps` / 10000, uma vez por representante, em BigInt, meio centavo para cima (mesma função `calcularComissaoCentavos`).

**Limites e estados honestos**:

- Credenciais ausentes ou de outra empresa → mensagem “Integração Omie indisponível”, sem números.
- Mais de 5.000 notas no período (50 páginas × 100) → erro pedindo período menor; nada é calculado com dados parciais. Lista que muda durante a leitura → erro pedindo nova consulta.
- Pausa de 400 ms entre chamadas; tempo total máximo de 110 s; limite de consumo do Omie (“consumo redundante/indevido”, HTTP 429) e credenciais recusadas viram mensagens claras.
- Resultado guardado no navegador por 5 minutos (mesmo período não reconsulta o Omie, exceto ao clicar em Consultar).
- Exportação CSV própria (`representantes-omie-…csv`) com a coluna Fonte, Sem representante e Total.

### Faturamento pelos pedidos do painel (visão secundária)

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
- `src/lib/mimo-representantes-omie.test.ts`: regras de inclusão de notas (canceladas, denegadas, inutilizadas, entrada, devolução, complementar/ajuste, homologação, fora do período, duplicadas, inválidas), centavos, CNPJ/CPF, atribuição (manual por documento vence UF, divergentes, sem UF, UF sem principal, não consultado), comissão sobre o total e CSV.
- `src/lib/mimo-representantes-omie.server.test.ts`: `fetch` simulado (o Omie real nunca é chamado) — paginação e filtros do `ListarNF`, só chamadas da lista, lote de clientes e consulta individual, limite de notas, lista que muda, credenciais recusadas, limite de consumo, prazo total.
- `src/lib/mimo-representantes-omie.functions.test.ts`: papel revalidado antes de qualquer consulta, indisponibilidade honesta, CNPJ só das unidades manuais da empresa, período validado.
- `src/components/mimo-representantes-comerciais-page.test.tsx`: Omie como fonte padrão (notas, exclusões, avisos), indisponível sem números, erro, Consultar, troca para pedidos do painel, importação colada, bloqueio com erros, atribuição manual e cadastro.

## Para liberar

1. Conferir no servidor as variáveis `OMIE_APP_KEY`, `OMIE_APP_SECRET` e `MIMO_OMIE_EMPRESA_ID` (as mesmas da inadimplência).
2. Abrir **Desempenho** com um mês fechado e comparar o total com o relatório de NF-e emitidas do Omie no mesmo período (mesmos filtros: saída, finalidade normal, autorizadas).
3. Conferir “Sem representante”: clientes do Omie sem UF e documentos de unidades manuais. Se a carteira não tiver o CNPJ de uma unidade com atribuição manual, a nota segue a UF do Omie.
4. Confirmar com a MiMo se a comissão deve incidir sobre `vNF` (total da nota) ou só sobre produtos; e se devoluções devem ser abatidas. Hoje: `vNF`, sem abater devoluções.
