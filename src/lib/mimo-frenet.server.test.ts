import { afterEach, describe, expect, it, vi } from "vitest";
import { novoPedido, type Pedido } from "./mimo-pedido";
import { compararFretes } from "./mimo-frete";
import {
  configFrenet,
  cotarFrenet,
  montarConsultasFrenet,
  validarComprovantesFrenet,
  type ConfigFrenet,
} from "./mimo-frenet.server";

const agora = Date.parse("2026-11-12T12:00:00Z");
const cfg: ConfigFrenet = {
  token: "token-sintetico",
  chaveAssinatura: "segredo-sintetico",
  origemCep: "96085440",
  postagens: [
    {
      transportadoraCodigo: "TESTE",
      servicoCodigo: "ECO",
      tipo: "postagem",
      descricao: "Ponto sintético em Pelotas",
      origemCep: "96085440",
    },
    {
      transportadoraCodigo: "TESTE",
      servicoCodigo: "EXP",
      tipo: "coleta",
      descricao: "Coleta sintética confirmada",
      origemCep: "96085440",
    },
  ],
};
function pedido(): Pedido {
  return {
    ...novoPedido(),
    leadId: "10000000-0000-4000-8000-000000000001",
    destinoCep: "66010000",
    endereco: "Destino sintético",
    declarado: 150000,
    itens: [
      {
        id: "item",
        codigo: "SINTETICO",
        nome: "Alimento sintético",
        unidade: "Unidade",
        tipo: "outro",
        quantidade: 4,
        precoOriginal: 37500,
        precoNegociado: 37500,
        desconto: { modo: "fixo", valor: 0 },
        brinde: false,
        custoInterno: null,
        pesoG: 4800,
      },
    ],
    volumes: [1, 2, 3, 4].map((n) => ({
      id: `v${n}`,
      caixa: "G",
      conteudo: [{ itemId: "item", quantidade: 1 }],
      pesoAjustadoG: 4800,
      confirmado: true,
    })),
  };
}
const linha = (
  ServiceCode = "ECO",
  ShippingPrice: string | number = "12.34",
  DeliveryTime: string | number | null = "6",
) => ({
  Error: false,
  Carrier: "Transportadora sintética",
  CarrierCode: "TESTE",
  ServiceCode,
  ServiceDescription: ServiceCode,
  ShippingPrice,
  DeliveryTime,
});
const enviar = (rows: unknown[] = [linha(), linha("EXP", "20.00", "2")]) =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ ShippingSevicesArray: rows }), { status: 200 }),
    );
afterEach(() => vi.unstubAllEnvs());

describe("multicotação Frenet", () => {
  it("usa os quatro volumes reais, kg/cm e divide a nota sem multiplicar seu valor", () => {
    const consultas = montarConsultasFrenet(pedido(), cfg);
    expect(consultas).toHaveLength(4);
    expect(consultas.reduce((s, c) => s + c.body.ShipmentInvoiceValue, 0)).toBe(1500);
    expect(consultas[0].body).toEqual({
      SellerCEP: "96085440",
      RecipientCEP: "66010000",
      RecipientCountry: "BR",
      ShipmentInvoiceValue: 375,
      ShippingItemArray: [{ Length: 24, Width: 24, Height: 18, Weight: 4.8, Quantity: 1 }],
    });
  });
  it("deduplica caixas iguais e soma todos os fretes; mais barata e mais rápida são diferentes", async () => {
    const p = pedido(),
      f = enviar();
    p.cotacoes = await cotarFrenet(p, cfg, "empresa", "ator", f, agora);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, options] = f.mock.calls[0];
    expect(url).toBe("https://api.frenet.com.br/shipping/quote");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "manual",
      headers: { token: cfg.token },
    });
    expect(JSON.parse(String(options?.body))).not.toHaveProperty("cliente");
    expect(p.cotacoes[0].valor).toBe(4936);
    expect(p.cotacoes[0].valoresVolumes).toEqual({ v1: 1234, v2: 1234, v3: 1234, v4: 1234 });
    expect(compararFretes(p.cotacoes)).toMatchObject({
      menor: { servicoCodigo: "ECO" },
      maisRapida: { servicoCodigo: "EXP", prazoDias: 2, valor: 8000 },
    });
    p.cotacaoId = p.cotacoes[0].id;
    expect(() => validarComprovantesFrenet(p, null, "empresa", "ator", cfg, agora)).not.toThrow();
  });
  it("distribui centavos restantes exatamente entre as caixas", () => {
    const p = pedido();
    p.declarado = 150001;
    expect(montarConsultasFrenet(p, cfg).map((c) => c.body.ShipmentInvoiceValue)).toEqual([
      375.01, 375, 375, 375,
    ]);
  });
  it("não retorna serviço que atende só parte das caixas", async () => {
    const p = pedido();
    p.volumes[1].pesoAjustadoG = 4900;
    const f = vi.fn<typeof fetch>().mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify({
            ShippingSevicesArray:
              JSON.parse(String(options?.body)).ShippingItemArray[0].Weight === 4.9
                ? []
                : [linha()],
          }),
        ),
    );
    await expect(cotarFrenet(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(
      "todas as caixas",
    );
  });
  it("não mistura códigos de serviço iguais de transportadoras diferentes", async () => {
    const p = pedido();
    p.volumes[1].pesoAjustadoG = 4900;
    const f = vi.fn<typeof fetch>().mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify({
            ShippingSevicesArray: [
              {
                ...linha(),
                CarrierCode:
                  JSON.parse(String(options?.body)).ShippingItemArray[0].Weight === 4.9
                    ? "OUTRA"
                    : "TESTE",
              },
            ],
          }),
        ),
    );
    await expect(cotarFrenet(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow(
      "todas as caixas",
    );
  });
  it("descarta erros, preços ausentes, serviços duplicados e retirada no destino", async () => {
    const f = enviar([
      { ...linha("ERRO"), Error: true },
      { ...linha("INVALIDA"), ShippingPrice: null },
      { ...linha("RETIRAR"), CarrierCode: "ISP" },
      linha("DUP", 10),
      linha("DUP", 12),
      linha("EXP", "10.015", null),
    ]);
    const rows = await cotarFrenet(pedido(), cfg, "empresa", "ator", f, agora);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      servicoCodigo: "EXP",
      valor: 4008,
      prazo: "Prazo a confirmar",
    });
    expect(compararFretes(rows).maisRapida).toBeNull();
  });
  it("não confunde ausência de confirmação de origem com frete utilizável", async () => {
    const p = pedido();
    p.cotacoes = await cotarFrenet(
      p,
      { ...cfg, postagens: [] },
      "empresa",
      "ator",
      enviar(),
      agora,
    );
    expect(compararFretes(p.cotacoes)).toEqual({ menor: null, maisRapida: null });
    p.cotacaoId = p.cotacoes[0].id;
    await expect(() => validarComprovantesFrenet(p, null, "empresa", "ator", cfg, agora)).toThrow(
      "ponto de postagem",
    );
    const old = structuredClone(p);
    old.cotacaoId = null;
    expect(() => validarComprovantesFrenet(p, old, "empresa", "ator", cfg, agora)).toThrow(
      "ponto de postagem",
    );
  });
  it("assina preço, prazo e ponto; recusa adulteração, outro ator e outra empresa", async () => {
    const p = pedido();
    p.cotacoes = await cotarFrenet(p, cfg, "empresa", "ator", enviar(), agora);
    p.cotacaoId = p.cotacoes[0].id;
    for (const alterar of [
      (c: any) => c.valor++,
      (c: any) => c.valoresVolumes.v1++,
      (c: any) => c.prazoDias++,
      (c: any) => (c.postagem.descricao = "Ponto adulterado"),
    ]) {
      const falso = structuredClone(p);
      alterar(falso.cotacoes[0]);
      expect(() => validarComprovantesFrenet(falso, null, "empresa", "ator", cfg, agora)).toThrow(
        "alterada",
      );
    }
    expect(() => validarComprovantesFrenet(p, null, "outra", "ator", cfg, agora)).toThrow();
    expect(() => validarComprovantesFrenet(p, null, "empresa", "outro", cfg, agora)).toThrow();
    expect(() =>
      validarComprovantesFrenet(p, null, "empresa", "ator", cfg, agora + 16 * 60_000),
    ).toThrow("expirou");
    expect(() =>
      validarComprovantesFrenet(
        p,
        structuredClone(p),
        "empresa",
        "ator",
        null,
        agora + 16 * 60_000,
      ),
    ).not.toThrow();
    const old = structuredClone(p);
    old.cotacaoId = null;
    expect(() =>
      validarComprovantesFrenet(p, old, "empresa", "ator", cfg, agora + 16 * 60_000),
    ).toThrow("expirou");
  });
  it.each([401, 403, 429, 500])(
    "falha HTTP %i nunca vira preço nem expõe token",
    async (status) => {
      const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(cfg.token, { status }));
      await expect(cotarFrenet(pedido(), cfg, "empresa", "ator", f, agora)).rejects.toThrow(
        /Frenet/,
      );
    },
  );
  it("recusa configuração ausente, caixas sem conferência e origem diferente antes da rede", async () => {
    vi.stubEnv("MIMO_FRENET_TOKEN", "");
    expect(configFrenet()).toBeNull();
    const f = enviar(),
      p = pedido();
    p.volumes[0].confirmado = false;
    await expect(cotarFrenet(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow("caixas");
    p.origemCep = "01001000";
    await expect(cotarFrenet(p, cfg, "empresa", "ator", f, agora)).rejects.toThrow("origem");
    expect(f).not.toHaveBeenCalled();
  });
});

it("compara totais por caixa tambem para cotacoes manuais", async () => {
  const rows = await cotarFrenet(pedido(), cfg, "empresa", "ator", enviar(), agora);
  const manual = {
    ...rows[0],
    id: "manual",
    provedor: undefined,
    valor: 0,
    valoresVolumes: { v1: 2000, v2: 2000, v3: 2000, v4: 2000 },
  };
  expect(compararFretes([manual, rows[0]]).menor?.id).toBe(rows[0].id);
});

it.each([302, 307])("recusa redirecionamento %s sem encaminhar token", async (status) => {
  const f = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    if (options?.redirect !== "manual") throw Error("Workers redirect mode");
    return new Response(null, {
      status,
      headers: { Location: "https://destino-invalido.example" },
    });
  });
  await expect(cotarFrenet(pedido(), cfg, "empresa", "ator", f, agora)).rejects.toThrow(
    "redirecionamento inesperado",
  );
  expect(f).toHaveBeenCalledTimes(1);
});
