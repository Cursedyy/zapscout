import { z } from "zod";
import { calcularPedido, descontar, type PedidoSalvo } from "./mimo-pedido";
import { codigoOmieSchema } from "./mimo-omie";

export const cadastroFiscalSchema = z.object({
  codigoCliente: codigoOmieSchema,
  codigoCategoria: z.string().trim().min(1).max(20),
  codigoContaCorrente: codigoOmieSchema,
  codigoParcela: z.string().trim().min(1).max(3),
  codigoCenarioImpostos: codigoOmieSchema.optional(),
  consumidorFinal: z.enum(["S", "N"]),
  modalidadeFrete: z.enum(["0", "1", "2", "3", "4", "9"]),
  produtosPorItem: z.record(z.string(), codigoOmieSchema),
});

export function montarInclusaoPedidoOmie(
  pedido: PedidoSalvo,
  cadastroFiscal: z.input<typeof cadastroFiscalSchema>,
  dataPrevisao: string,
) {
  const cadastro = cadastroFiscalSchema.parse(cadastroFiscal);
  const documento = pedido.documento;
  if (
    pedido.status !== "confirmado" ||
    documento.status !== "confirmado" ||
    !documento.itens.length
  ) {
    throw Error("Selecione um pedido confirmado com itens.");
  }
  if (documento.pagamento.forma === "pix" && !pedido.pix) {
    throw Error("Confirme o recebimento PIX antes de faturar.");
  }
  const data = new Date(`${dataPrevisao}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dataPrevisao) ||
    !Number.isFinite(data.getTime()) ||
    data.toISOString().slice(0, 10) !== dataPrevisao
  ) {
    throw Error("Informe uma data de previsão válida.");
  }
  const totais = calcularPedido(documento);
  if (
    totais.total !== pedido.total ||
    totais.produtos !== pedido.produtos ||
    totais.frete !== pedido.frete
  ) {
    throw Error("Os totais do pedido salvo precisam ser conferidos antes de enviar ao Omie.");
  }
  if (
    documento.descontoGeral.valor ||
    totais.brutoProdutos !== totais.produtos ||
    documento.itens.some((item) => item.brinde)
  ) {
    throw Error(
      "Pedido com desconto geral, acréscimo de cartão ou brinde exige regra fiscal específica.",
    );
  }
  if (totais.freteCliente > 0 && cadastro.modalidadeFrete === "9") {
    throw Error("Selecione uma modalidade compatível com o frete cobrado.");
  }
  const numero = codigoOmieSchema.parse(pedido.numero);
  return {
    cabecalho: {
      codigo_pedido_integracao: `MIMO-${numero}`,
      codigo_cliente: cadastro.codigoCliente,
      codigo_parcela: cadastro.codigoParcela,
      codigo_cenario_impostos: cadastro.codigoCenarioImpostos,
      data_previsao: dataPrevisao.split("-").reverse().join("/"),
      etapa: "10",
      quantidade_itens: documento.itens.length,
    },
    det: documento.itens.map((item, indice) => {
      const produto = cadastro.produtosPorItem[item.id];
      if (produto === undefined) throw Error(`Vincule o produto do item ${indice + 1} ao Omie.`);
      const bruto = item.precoNegociado * item.quantidade;
      return {
        ide: { codigo_item_integracao: String(indice + 1) },
        produto: {
          codigo_produto: produto,
          quantidade: item.quantidade,
          valor_unitario: item.precoNegociado / 100,
          tipo_desconto: "V",
          valor_desconto: (bruto - descontar(bruto, item.desconto)) / 100,
        },
      };
    }),
    frete: { modalidade: cadastro.modalidadeFrete, valor_frete: totais.freteCliente / 100 },
    informacoes_adicionais: {
      codigo_categoria: cadastro.codigoCategoria,
      codigo_conta_corrente: cadastro.codigoContaCorrente,
      consumidor_final: cadastro.consumidorFinal,
      enviar_email: "N",
    },
  };
}
