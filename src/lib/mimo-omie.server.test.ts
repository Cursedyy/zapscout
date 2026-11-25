import { expect, it, vi } from "vitest";
import { configOmie, consultarPedidoOmie, versaoOmie } from "./mimo-omie.server";

const env = {
  OMIE_APP_KEY: "app-sintetico",
  OMIE_APP_SECRET: "segredo-sintetico",
  MIMO_OMIE_EMPRESA_ID: "10000000-0000-4000-8000-000000000001",
};
const cfg = configOmie(env)!;
const pedido = {
  cabecalho: { codigo_pedido: 123 },
  infoCadastro: { faturado: "N", cancelado: "N" },
  det: [
    { ide: { codigo_item: 1 }, produto: { cfop: "5.102" }, imposto: { icms: { aliq_icms: 18 } } },
  ],
};
it("só permite configuração server-side vinculada e modo simulação", () => {
  expect(configOmie({})).toBeNull();
  expect(cfg.modo).toBe("simulacao");
  expect(configOmie({ ...env, MIMO_OMIE_MODO: "escrita" })).toBeNull();
  expect(configOmie({ ...env, MIMO_OMIE_EMPRESA_ID: "" })).toBeNull();
});
it("consulta somente a API fixa com timeout, sem seguir redirects", async () => {
  const fetcher = vi.fn(async () => Response.json({ pedido_venda_produto: pedido }));
  expect(await consultarPedidoOmie(cfg, 123, fetcher)).toEqual(pedido);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://app.omie.com.br/api/v1/produtos/pedido/");
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body as string)).toEqual({
    call: "ConsultarPedido",
    app_key: cfg.appKey,
    app_secret: cfg.secret,
    param: [{ codigo_pedido: 123 }],
  });
});
it.each([
  { faultcode: "segredo-sintetico", faultstring: "Detalhe sensível" },
  { pedido_venda_produto: { ...pedido, cabecalho: { codigo_pedido: 999 } } },
  { pedido_venda_produto: { ...pedido, det: [] } },
])("oculta detalhes e rejeita respostas inválidas %#", async (body) => {
  await expect(consultarPedidoOmie(cfg, 123, async () => Response.json(body))).rejects.toThrow(
    "Não foi possível consultar este pedido no OMIE. Confira o código e tente novamente.",
  );
});
it("não repete chamada após timeout ou erro HTTP", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("timeout com segredo-sintetico"));
  await expect(consultarPedidoOmie(cfg, 123, fetcher)).rejects.toThrow(/Não foi possível/);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(
    consultarPedidoOmie(cfg, 123, async () => new Response("segredo", { status: 401 })),
  ).rejects.toThrow(/Não foi possível/);
});
it("a versão cobre todo o documento, empresa e aplicativo, sem depender da ordem das chaves", async () => {
  const original = await versaoOmie(cfg, pedido);
  expect(
    await versaoOmie(cfg, {
      det: pedido.det,
      infoCadastro: pedido.infoCadastro,
      cabecalho: pedido.cabecalho,
    }),
  ).toBe(original);
  expect(await versaoOmie({ ...cfg, appKey: "outra" }, pedido)).not.toBe(original);
  expect(await versaoOmie({ ...cfg, empresaId: "outra" }, pedido)).not.toBe(original);
  expect(await versaoOmie(cfg, { ...pedido, frete: { valor: 1 } })).not.toBe(original);
});
