import { expect, it, vi } from "vitest";
import {
  conferirPedidoEnviadoOmie,
  incluirPedidoParaConferenciaOmie,
  localizarClienteEnvioOmie,
  resolverProdutosOmie,
} from "./mimo-omie-envio.server";

const cfg = { appKey: "sintetica", secret: "segredo-sintetico" };
const lista = (itens: object[]) =>
  Response.json({
    total_de_paginas: itens.length ? 1 : 0,
    total_de_registros: itens.length,
    produto_servico_cadastro: itens,
  });
const produto = (id: number, codigo: string, inativo = "N") => ({
  codigo_produto: id,
  codigo,
  descricao: `Produto ${codigo}`,
  inativo,
});
const linha = (id: string, codigo: string) => ({
  id,
  codigo,
  nome: codigo,
  quantidade: 2,
  unidade: "UN",
});

it("consulta display e unidade sem confundir a quantidade do pedido com caixas de embarque", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(lista([produto(100, "M001"), produto(101, "DP001"), produto(102, "UN004")]));
  const itens = [
    { ...linha("a", "M001"), unidade: "Display de 15" },
    linha("b", "M004"),
    { ...linha("c", "M004"), unidade: "Caixa com 6 unidades" },
  ];
  const resultado = await resolverProdutosOmie(cfg, itens, { M001: 100 }, fetcher);
  expect(resultado.map((item) => [item.codigo, item.quantidade, item.produto?.id])).toEqual([
    ["DP001", 2, 101],
    ["UN004", 2, 102],
    ["M004", 2, undefined],
  ]);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).param[0].produtosPorCodigo).toEqual([
    { codigo: "DP001" },
    { codigo: "UN004" },
  ]);
});

it("preenche vários itens pelo SKU ou vínculo aprovado e deixa inativos e ambiguidades pendentes", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      lista([
        produto(101, "SKU1"),
        produto(102, "SKU2", "S"),
        produto(103, "SKU3"),
        produto(104, "SKU3"),
      ]),
    )
    .mockResolvedValueOnce(lista([produto(105, "OUTRO-SKU")]));
  const itens = [
    linha("a", "SKU1"),
    linha("b", "SKU2"),
    linha("c", "SKU3"),
    linha("d", "SKU4"),
    linha("e", "SKU1"),
  ];
  const resultado = await resolverProdutosOmie(cfg, itens, { SKU4: 105 }, fetcher);
  expect(resultado.map((i) => i.produto?.id ?? null)).toEqual([101, null, null, 105, 101]);
  expect(
    fetcher.mock.calls.map(([url, opcoes]) => {
      const corpo = JSON.parse(String(opcoes?.body));
      return [url, corpo.call, corpo.param[0].produtosPorCodigo];
    }),
  ).toEqual([
    [
      "https://app.omie.com.br/api/v1/geral/produtos/",
      "ListarProdutos",
      [{ codigo: "SKU1" }, { codigo: "SKU2" }, { codigo: "SKU3" }],
    ],
    ["https://app.omie.com.br/api/v1/geral/produtos/", "ListarProdutos", [{ codigo_produto: 105 }]],
  ]);
});

it("recusa uma lista incompleta e trata catálogo sem resultados como pendência", async () => {
  const itens = [linha("a", "SKU1")];
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ total_de_paginas: 1, total_de_registros: 1 }))
    .mockResolvedValueOnce(
      Response.json({ faultstring: "Não existem registros para a página [1]" }, { status: 500 }),
    );
  await expect(resolverProdutosOmie(cfg, itens, {}, fetcher)).rejects.toThrow(
    "Não foi possível consultar",
  );
  await expect(resolverProdutosOmie(cfg, itens, {}, fetcher)).resolves.toEqual([
    { ...itens[0], produto: null },
  ]);
});

it("confirma o cliente ativo pelo documento exato", async () => {
  const cadastro = {
    codigo_cliente_omie: 9,
    razao_social: "Loja de teste",
    cnpj_cpf: "12.345.678/0001-00",
    inativo: "N",
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
    Response.json({
      total_de_paginas: 1,
      clientes_cadastro: [cadastro, { ...cadastro, codigo_cliente_omie: 8, inativo: "S" }],
    }),
  );
  await expect(localizarClienteEnvioOmie(cfg, "12345678000100", fetcher)).resolves.toEqual({
    id: 9,
    nome: "Loja de teste",
  });
});

it("usa inclusão de pedido e confere produtos, valores e número comercial sem chamar faturamento", async () => {
  const pedido: Parameters<typeof incluirPedidoParaConferenciaOmie>[1] = {
    cabecalho: {
      codigo_pedido_integracao: "MIMO-12",
      codigo_cliente: 9,
      codigo_parcela: "001",
      codigo_cenario_impostos: undefined,
      data_previsao: "20/11/2026",
      etapa: "10",
      quantidade_itens: 2,
    },
    det: [101, 102].map((id, indice) => ({
      ide: { codigo_item_integracao: String(indice + 1) },
      produto: {
        codigo_produto: id,
        quantidade: 2,
        valor_unitario: 10,
        tipo_desconto: "V",
        valor_desconto: 0,
      },
    })),
    frete: { modalidade: "9", valor_frete: 0 },
    informacoes_adicionais: {
      codigo_categoria: "1.01",
      codigo_conta_corrente: 2,
      consumidor_final: "N",
      enviar_email: "N",
    },
  };
  const remoto = {
    ...pedido,
    cabecalho: { ...pedido.cabecalho, codigo_pedido: 900, numero_pedido: "1000" },
    infoCadastro: { cancelado: "N", faturado: "N" },
    det: [...pedido.det].reverse(),
    total_pedido: { valor_total_pedido: 40 },
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        codigo_status: "0",
        codigo_pedido: 900,
        codigo_pedido_integracao: "MIMO-12",
      }),
    )
    .mockResolvedValueOnce(Response.json({ pedido_venda_produto: remoto }))
    .mockResolvedValueOnce(Response.json({ ...remoto, total_pedido: { valor_total_pedido: 38 } }));
  await incluirPedidoParaConferenciaOmie(cfg, pedido, fetcher);
  await expect(conferirPedidoEnviadoOmie(cfg, pedido, 4000, fetcher)).resolves.toEqual({
    codigo: 900,
    numero: "1000",
    assinatura: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  await expect(conferirPedidoEnviadoOmie(cfg, pedido, 4000, fetcher)).rejects.toThrow(
    "não confere",
  );
  expect(fetcher.mock.calls.map(([, opcoes]) => JSON.parse(String(opcoes?.body)).call)).toEqual([
    "IncluirPedido",
    "ConsultarPedido",
    "ConsultarPedido",
  ]);
});
