import { describe, expect, it } from "vitest";
import { alterarSomenteCfop, cfopOmieSchema } from "./mimo-omie";
import { PAPEIS_MIMO, podeAbrirPagina } from "./mimo-acesso";

export function pedidoSinteticoOmie() {
  return {
    cabecalho: { codigo_pedido: 123, numero_pedido: "PV-1", codigo_cliente: 456, etapa: "20" },
    infoCadastro: { faturado: "N", cancelado: "N", dAlt: "24/11/2026" },
    det: [1, 2].map((id) => ({
      ide: { codigo_item: id, codigo_item_integracao: `item-${id}` },
      produto: {
        cfop: "5.102",
        descricao: `Produto sintético ${id}`,
        quantidade: 3,
        valor_unitario: 12.34,
        ncm: "00000000",
        campo_futuro: { preservado: true },
      },
      imposto: {
        icms: { aliq_icms: 18, base_icms: 37.02, valor_icms: 6.6636, cod_sit_trib_icms: "00" },
        icms_sn: { aliq_icms_sn: 1.25, valor_credito_icms_sn: 0.46275 },
        pis_padrao: { aliq_pis: 0.65, valor_pis: 0.24063 },
        cofins_padrao: { aliq_cofins: 3, valor_cofins: 1.1106 },
        ipi: { aliq_ipi: 0, valor_ipi: 0 },
        campo_novo: { valor: null },
      },
      inf_adic: { peso_bruto: 0.3, dados_adicionais_item: "Dado sintético" },
    })),
    frete: { valor_frete: 22.75 },
    lista_parcelas: { parcela: [{ numero_parcela: 1, valor: 96.79 }] },
    observacoes: { obs_venda: "Documento sintético" },
    extensao_futura: { array: [0, false, null, "preservar"] },
  };
}
describe("prévia CFOP OMIE", () => {
  it("altera somente os caminhos selecionados, sem perder campos nem modificar a origem", () => {
    const origem = pedidoSinteticoOmie(),
      antes = structuredClone(origem);
    const { documento, mudancas } = alterarSomenteCfop(origem, [{ itemId: 1, cfop: "6102" }]);
    const esperado = structuredClone(origem);
    esperado.det[0].produto.cfop = "6.102";
    expect(documento).toEqual(esperado);
    expect(origem).toEqual(antes);
    expect(documento.det[0].imposto).toEqual(antes.det[0].imposto);
    expect(documento.det[1]).toEqual(antes.det[1]);
    expect(mudancas).toEqual([{ itemId: 1, anterior: "5.102", novo: "6.102" }]);
  });
  it("aceita vários itens sem recalcular impostos", () => {
    const origem = pedidoSinteticoOmie();
    const { documento } = alterarSomenteCfop(origem, [
      { itemId: 1, cfop: "6.102" },
      { itemId: 2, cfop: "5.101" },
    ]);
    documento.det.forEach((i, n) => expect(i.imposto).toEqual(origem.det[n].imposto));
  });
  it.each(
    [
      [],
      [{ itemId: 3, cfop: "6102" }],
      [{ itemId: 1, cfop: "5102" }],
      [
        { itemId: 1, cfop: "6102" },
        { itemId: 1, cfop: "6101" },
      ],
      [{ itemId: 1, cfop: "6102", imposto: {} }],
    ].map((mudancas) => ({ mudancas })),
  )("recusa seleção inválida ou sem mudança %#", ({ mudancas }) => {
    expect(() => alterarSomenteCfop(pedidoSinteticoOmie(), mudancas)).toThrow();
  });
  it.each(["faturado", "cancelado"])("recusa pedido %s", (campo) => {
    const pedido = pedidoSinteticoOmie();
    Object.assign(pedido.infoCadastro, { [campo]: "S" });
    expect(() => alterarSomenteCfop(pedido, [{ itemId: 1, cfop: "6102" }])).toThrow(
      /não faturados/,
    );
  });
  it("recusa imposto ausente e identidades duplicadas", () => {
    const pedido = pedidoSinteticoOmie();
    pedido.det[1].ide.codigo_item = 1;
    expect(() => alterarSomenteCfop(pedido, [{ itemId: 1, cfop: "6102" }])).toThrow(/revisão/);
    const semImposto = pedidoSinteticoOmie();
    Reflect.deleteProperty(semImposto.det[0], "imposto");
    expect(() => alterarSomenteCfop(semImposto, [{ itemId: 1, cfop: "6102" }])).toThrow();
  });
  it("valida apenas formato, sem escolher código tributário", () => {
    expect(cfopOmieSchema.parse("6102")).toBe("6.102");
    expect(cfopOmieSchema.safeParse("610").success).toBe(false);
  });
  it.each(PAPEIS_MIMO)("restringe menu OMIE para %s", (papel) => {
    expect(podeAbrirPagina(papel, "/mimo/omie")).toBe(["administrador", "gestor"].includes(papel));
  });
});
