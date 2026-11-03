import {
  assinaturaFrete,
  calcularPedido,
  caixaDoVolume,
  sugerirCaixas,
  type Pedido,
} from "./mimo-pedido";
import { CAIXAS_PADRAO, type CaixaTipo } from "./mimo-tira-regras";

/** Automação de rascunho; nunca confirma peso, caixa, pagamento ou emissão. */
export function atualizarPedidoAutomatico(
  p: Pedido,
  alteracoes: Partial<Pedido>,
  caixas: CaixaTipo[] = CAIXAS_PADRAO,
): Pedido {
  const proximo = { ...p, ...alteracoes };
  const composicao = (x: Pedido) =>
    JSON.stringify(x.itens.map((i) => [i.id, i.quantidade, i.pesoG, i.tipo]));
  if (alteracoes.itens && composicao(p) !== composicao(proximo)) {
    try {
      const volumes = sugerirCaixas(proximo.itens);
      const validas = volumes.every((v) =>
        caixas.some(
          (c) =>
            c.ativo &&
            c.id === v.caixa &&
            JSON.stringify(c.dimensoes) === JSON.stringify(caixaDoVolume(v).dimensoes) &&
            c.displays === caixaDoVolume(v).displays &&
            c.misturinhas === caixaDoVolume(v).misturinhas,
        ),
      );
      proximo.volumes = validas ? volumes : [];
    } catch {
      proximo.volumes = [];
    }
  }
  if (
    proximo.declaradoProvisorio &&
    (alteracoes.itens || alteracoes.descontoGeral || alteracoes.declaradoProvisorio === true)
  ) {
    const total = calcularPedido(proximo);
    proximo.declarado = total.produtos + total.bonificacoes;
  }
  if (assinaturaFrete(p) !== assinaturaFrete(proximo)) proximo.cotacaoId = null;
  return proximo;
}
