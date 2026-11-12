import {
  avaliarVolume,
  calcularPedido,
  caixaDoVolume,
  conferirDistribuicao,
  type Pedido,
} from "./mimo-pedido";

/** Physical boxes and declared value, shared by freight providers. Money stays in cents. */
export function prepararRemessaFrete(p: Pedido) {
  if (
    !p.leadId ||
    !/^\d{8}$/.test(p.origemCep) ||
    !/^\d{8}$/.test(p.destinoCep) ||
    !p.endereco.trim()
  )
    throw Error("Informe o cliente, CEP e endereço de entrega.");
  if (!p.itens.length || !p.volumes.length || !conferirDistribuicao(p.itens, p.volumes))
    throw Error("Confira a distribuição dos produtos nas caixas.");
  calcularPedido(p);
  if (p.declarado <= 0) throw Error("Confira o valor da mercadoria antes de calcular o frete.");
  const bases = p.volumes.map((v) =>
    v.conteudo.reduce((s, c) => {
      const item = p.itens.find((i) => i.id === c.itemId)!;
      return (
        s + BigInt(item.brinde ? item.precoOriginal : item.precoNegociado) * BigInt(c.quantidade)
      );
    }, 0n),
  );
  const soma = bases.reduce((a, b) => a + b, 0n);
  if (!soma)
    throw Error(
      "Informe o valor dos produtos para distribuir o valor da mercadoria entre as caixas.",
    );
  const valores = bases.map((b) => Number((BigInt(p.declarado) * b) / soma));
  let resto = p.declarado - valores.reduce((a, b) => a + b, 0);
  const ordem = bases
    .map((b, i) => ({ i, r: (BigInt(p.declarado) * b) % soma }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of ordem) {
    if (!resto) break;
    valores[i]++;
    resto--;
  }
  return p.volumes.map((v, i) => {
    const a = avaliarVolume(v, p.itens);
    if (!v.confirmado || !v.conteudo.length || a.pesoCotacaoG === null || a.pesoCotacaoG <= 0)
      throw Error("Confira as caixas e informe o peso dos volumes pendentes.");
    if (valores[i] <= 0) throw Error("Confira o valor declarado de cada caixa.");
    return {
      id: v.id,
      pesoG: a.pesoCotacaoG,
      dimensoes: caixaDoVolume(v).dimensoes,
      declaradoCentavos: valores[i],
    };
  });
}
