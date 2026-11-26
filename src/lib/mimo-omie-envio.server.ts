import { z } from "zod";
import { codigoVendaMimo } from "./mimo-codigos-produto";
import { codigoOmieSchema } from "./mimo-omie";
import { hashOmie, type ConfigOmie } from "./mimo-omie.server";
import type { montarInclusaoPedidoOmie } from "./mimo-omie-faturamento";
import type { ItemPedido } from "./mimo-pedido";

const fetchOmie: typeof fetch = (...args) => globalThis.fetch(...args);
const produtoOmieSchema = z.object({
  codigo_produto: codigoOmieSchema,
  codigo: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(500),
  unidade: z.string().trim().max(80).nullish(),
  inativo: z.enum(["S", "N"]),
});
export type ProdutoOmie = z.infer<typeof produtoOmieSchema>;
type Credenciais = Pick<ConfigOmie, "appKey" | "secret">;
type PedidoOmie = ReturnType<typeof montarInclusaoPedidoOmie>;

export async function chamarOmie(
  cfg: Credenciais,
  endpoint:
    | "geral/produtos"
    | "geral/clientes"
    | "produtos/pedido"
    | "produtos/pedidoetapas"
    | "produtos/pedidovendafat",
  call:
    | "ListarProdutos"
    | "ListarClientes"
    | "ConsultarPedido"
    | "IncluirPedido"
    | "StatusPedido"
    | "ListarEtapasPedido"
    | "ValidarPedidoVenda"
    | "FaturarPedidoVenda",
  parametro: object,
  fetcher: typeof fetch,
): Promise<unknown> {
  const resposta = await fetcher(`https://app.omie.com.br/api/v1/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      call,
      app_key: cfg.appKey,
      app_secret: cfg.secret,
      param: [parametro],
    }),
  });
  const dados = z
    .object({ faultcode: z.string().nullish(), faultstring: z.string().nullish() })
    .passthrough()
    .parse(await resposta.json());
  if (
    /não existem registros para a página|nenhum registro encontrado/i.test(
      dados.faultstring ?? "",
    ) &&
    (call === "ListarProdutos" || call === "ListarClientes")
  ) {
    return { total_de_paginas: 0, total_de_registros: 0 };
  }
  if (!resposta.ok || dados.faultcode || dados.faultstring)
    throw Error("Resposta inválida do Omie.");
  return dados;
}

export async function resolverProdutosOmie(
  cfg: Credenciais,
  itens: Pick<ItemPedido, "id" | "codigo" | "nome" | "quantidade" | "unidade">[],
  vinculos: Record<string, number> = {},
  fetcher = fetchOmie,
) {
  const codigos = new Set<string>();
  const ids = new Set<number>();
  const itensPorEmbalagem = itens.map((item) => ({ item, codigo: codigoVendaMimo(item) }));
  for (const { codigo } of itensPorEmbalagem) {
    if (!codigo) continue;
    if (Object.hasOwn(vinculos, codigo)) ids.add(vinculos[codigo]);
    else codigos.add(codigo);
  }
  const encontrados: ProdutoOmie[] = [];
  try {
    // O filtro do Omie usa um único tipo de identificação por chamada.
    for (const filtro of [
      [...codigos].map((codigo) => ({ codigo })),
      [...ids].map((codigo_produto) => ({ codigo_produto })),
    ]) {
      if (!filtro.length) continue;
      const pagina = z
        .object({
          total_de_paginas: z.number().int().min(0).max(1),
          total_de_registros: z.number().int().min(0).max(100),
          produto_servico_cadastro: z.array(produtoOmieSchema).default([]),
        })
        .parse(
          await chamarOmie(
            cfg,
            "geral/produtos",
            "ListarProdutos",
            {
              pagina: 1,
              registros_por_pagina: 100,
              apenas_importado_api: "N",
              produtosPorCodigo: filtro,
            },
            fetcher,
          ),
        );
      if (pagina.produto_servico_cadastro.length !== pagina.total_de_registros)
        throw Error("Lista de produtos incompleta.");
      encontrados.push(...pagina.produto_servico_cadastro);
    }
  } catch {
    throw Error("Não foi possível consultar os códigos dos produtos no Omie. Tente novamente.");
  }

  return itensPorEmbalagem.map(({ item, codigo }) => {
    const id = codigo && Object.hasOwn(vinculos, codigo) ? vinculos[codigo] : undefined;
    const candidatos = encontrados.filter((p) =>
      id === undefined ? p.codigo === codigo : p.codigo_produto === id,
    );
    const produtos = [...new Map(candidatos.map((p) => [p.codigo_produto, p])).values()];
    const produto = produtos.length === 1 && produtos[0].inativo === "N" ? produtos[0] : null;
    return {
      id: item.id,
      codigo: codigo ?? item.codigo,
      nome: item.nome,
      quantidade: item.quantidade,
      unidade: item.unidade,
      produto: produto
        ? {
            id: produto.codigo_produto,
            codigo: produto.codigo,
            nome: produto.descricao,
            unidade: produto.unidade ?? null,
          }
        : null,
    };
  });
}

export async function localizarClienteEnvioOmie(
  cfg: Credenciais,
  documento: string,
  fetcher = fetchOmie,
) {
  try {
    const resultado = z
      .object({
        total_de_paginas: z.number().int().min(0).max(1),
        clientes_cadastro: z
          .array(
            z.object({
              codigo_cliente_omie: codigoOmieSchema,
              cnpj_cpf: z.string(),
              razao_social: z.string().trim().min(1).max(200),
              inativo: z.enum(["S", "N"]),
            }),
          )
          .default([]),
      })
      .parse(
        await chamarOmie(
          cfg,
          "geral/clientes",
          "ListarClientes",
          {
            pagina: 1,
            registros_por_pagina: 50,
            apenas_importado_api: "N",
            clientesFiltro: { cnpj_cpf: documento, inativo: "N" },
          },
          fetcher,
        ),
      );
    const clientes = resultado.clientes_cadastro.filter(
      (c) => c.inativo === "N" && c.cnpj_cpf.replace(/\D/g, "") === documento,
    );
    if (clientes.length === 1)
      return { id: clientes[0].codigo_cliente_omie, nome: clientes[0].razao_social };
  } catch {
    throw Error("Não foi possível consultar o cadastro do cliente no Omie.");
  }
  throw Error("O CPF ou CNPJ precisa identificar um único cliente ativo no Omie.");
}

export async function incluirPedidoParaConferenciaOmie(
  cfg: Credenciais,
  pedido: PedidoOmie,
  fetcher = fetchOmie,
) {
  const resposta = await chamarOmie(cfg, "produtos/pedido", "IncluirPedido", pedido, fetcher);
  z.object({
    codigo_status: z.literal("0"),
    codigo_pedido: codigoOmieSchema,
    codigo_pedido_integracao: z.literal(pedido.cabecalho.codigo_pedido_integracao),
  }).parse(resposta);
}

export async function lerPedidoComercialOmie(
  cfg: Credenciais,
  codigo_pedido_integracao: string,
  fetcher = fetchOmie,
) {
  const schema = z.object({
    cabecalho: z.object({
      codigo_pedido: codigoOmieSchema,
      codigo_pedido_integracao: z.literal(codigo_pedido_integracao),
      numero_pedido: z.string().trim().min(1).max(15),
      codigo_cliente: z.coerce.number().pipe(codigoOmieSchema),
      codigo_parcela: z.string(),
    }),
    frete: z.object({ modalidade: z.string(), valor_frete: z.number().default(0) }),
    informacoes_adicionais: z.object({
      codigo_categoria: z.string(),
      codigo_conta_corrente: z.coerce.number().pipe(codigoOmieSchema),
      consumidor_final: z.enum(["S", "N"]),
    }),
    infoCadastro: z.object({ cancelado: z.literal("N"), faturado: z.enum(["S", "N"]) }),
    total_pedido: z.object({ valor_total_pedido: z.number() }),
    det: z.array(
      z.object({
        ide: z.object({ codigo_item_integracao: z.string() }),
        produto: z.object({
          codigo_produto: z.coerce.number().pipe(codigoOmieSchema),
          quantidade: z.number(),
          valor_unitario: z.number(),
          valor_desconto: z.number().default(0),
        }),
      }),
    ),
  });
  const resposta = await chamarOmie(
    cfg,
    "produtos/pedido",
    "ConsultarPedido",
    { codigo_pedido_integracao },
    fetcher,
  );
  const bruto = z
    .object({ pedido_venda_produto: z.unknown().optional() })
    .passthrough()
    .parse(resposta);
  const documento = bruto.pedido_venda_produto ?? bruto;
  const remoto = schema.parse(documento);
  const assinatura = await hashOmie({
    cabecalho: remoto.cabecalho,
    frete: remoto.frete,
    informacoes_adicionais: remoto.informacoes_adicionais,
    total_pedido: remoto.total_pedido,
    det: [...remoto.det].sort((a, b) =>
      a.ide.codigo_item_integracao.localeCompare(b.ide.codigo_item_integracao),
    ),
  });
  return { remoto, assinatura, documento };
}

export async function conferirPedidoEnviadoOmie(
  cfg: Credenciais,
  pedido: PedidoOmie,
  total: number,
  fetcher = fetchOmie,
) {
  const { remoto, assinatura } = await lerPedidoComercialOmie(
    cfg,
    pedido.cabecalho.codigo_pedido_integracao,
    fetcher,
  );
  const itens = new Map(
    remoto.det.map((linha) => [linha.ide.codigo_item_integracao, linha.produto]),
  );
  if (
    remoto.det.length !== pedido.det.length ||
    itens.size !== pedido.det.length ||
    remoto.cabecalho.codigo_cliente !== pedido.cabecalho.codigo_cliente ||
    remoto.informacoes_adicionais.codigo_categoria !==
      pedido.informacoes_adicionais.codigo_categoria ||
    remoto.informacoes_adicionais.codigo_conta_corrente !==
      pedido.informacoes_adicionais.codigo_conta_corrente ||
    remoto.informacoes_adicionais.consumidor_final !==
      pedido.informacoes_adicionais.consumidor_final ||
    remoto.cabecalho.codigo_parcela.trim().padStart(3, "0") !==
      pedido.cabecalho.codigo_parcela.padStart(3, "0") ||
    remoto.frete.modalidade !== pedido.frete.modalidade ||
    Math.round(remoto.frete.valor_frete * 100) !== Math.round(pedido.frete.valor_frete * 100) ||
    Math.round(remoto.total_pedido.valor_total_pedido * 100) !== total ||
    !pedido.det.every(({ ide, produto }) => {
      const gravado = itens.get(ide.codigo_item_integracao);
      return (
        gravado &&
        gravado.codigo_produto === produto.codigo_produto &&
        gravado.quantidade === produto.quantidade &&
        Math.round(gravado.valor_unitario * 100) === Math.round(produto.valor_unitario * 100) &&
        Math.round(gravado.valor_desconto * 100) === Math.round(produto.valor_desconto * 100)
      );
    })
  )
    throw Error("O pedido localizado no Omie não confere com o Tira Pedido.");
  return {
    codigo: remoto.cabecalho.codigo_pedido,
    numero: remoto.cabecalho.numero_pedido,
    assinatura,
  };
}
