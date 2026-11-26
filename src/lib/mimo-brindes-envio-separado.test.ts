import { describe, expect, it } from 'vitest';
import {
  CATALOGO,
  assinaturaFrete,
  avaliarVolume,
  calcularPedido,
  conferirDistribuicao,
  ehEnvioSeparado,
  itemDeProduto,
  normalizarRemessaPrincipal,
  novoPedido,
  pedidoSchema,
  pendenciasPedido,
  sugerirCaixas,
  validarSalvar,
  volumesRemessaPrincipal,
  type ItemPedido,
  type Pedido,
  type Volume,
} from './mimo-pedido';
import { itemDeBrinde, prepararDocumento, type Brinde } from './mimo-tira-regras';
import { prepararRemessaFrete } from './mimo-frete-remessa';
import { atualizarPedidoAutomatico } from './mimo-pedido-automatico';

const produto = CATALOGO.find(p => p.codigo === 'M001');
if (!produto) throw new Error('Produto sintético obrigatório ausente.');
const taxas = [313, 368, 368, 368, 368, 368, 589, 589, 589, 589, 589, 589];
const leadId = '00000000-0000-4000-8000-000000000001';

function externo(id = 'externo', quantidade = 1): ItemPedido {
  return {
    id, codigo: '', nome: 'Brinde externo sintético', unidade: 'Unidade', tipo: 'outro', quantidade,
    precoOriginal: 0, precoNegociado: 0, desconto: { modo: 'percentual', valor: 0 },
    brinde: true, custoInterno: null, pesoG: null, envioSeparado: true,
  };
}
function reutilizavel(envioSeparado?: boolean): Brinde {
  return {
    id: 'air', nome: 'Air Fryer sintética', unidade: 'Unidade', pesoG: null,
    custoInterno: null, ativo: true, ...(envioSeparado === undefined ? {} : { envioSeparado }),
  };
}
function volume(id: string, conteudo: Volume['conteudo']): Volume {
  return { id, caixa: 'P', conteudo, pesoAjustadoG: 9000, confirmado: true };
}
function pedidoPronto(itens: ItemPedido[], volumes?: Volume[]): Pedido {
  const base: Pedido = {
    ...novoPedido(), leadId, destinoCep: '01001000', endereco: 'Endereço sintético',
    itens, volumes: volumes ?? sugerirCaixas(itens).map(v => ({ ...v, confirmado: true })),
    fretePagador: 'cliente', declarado: 10000, declaradoProvisorio: false,
  };
  return {
    ...base,
    cotacoes: [{ id: 'c', modalidade: 'Manual', prazo: '3 dias', modo: 'remessa', valor: 1500, valoresVolumes: {}, assinatura: assinaturaFrete(base), registradaEm: '2026-11-26T12:00:00.000Z', oficial: true }],
    cotacaoId: 'c',
  };
}

describe('brindes com envio separado', () => {
  it('usa origem e cadastro explícito, nunca nome ou peso ausente', () => {
    const antigo = externo('antigo');
    delete antigo.envioSeparado;
    expect(ehEnvioSeparado(antigo)).toBe(true);
    expect(ehEnvioSeparado({ ...itemDeProduto(produto, 1, true), pesoG: null })).toBe(false);
    expect(ehEnvioSeparado(itemDeBrinde(reutilizavel()))).toBe(false);
    expect(ehEnvioSeparado(itemDeBrinde(reutilizavel(false)))).toBe(false);
    expect(ehEnvioSeparado(itemDeBrinde(reutilizavel(true)))).toBe(true);
    expect(ehEnvioSeparado({ ...itemDeProduto(produto, 1, true), envioSeparado: true })).toBe(false);
    const cadastrado = itemDeBrinde({ ...reutilizavel(true), id: crypto.randomUUID() });
    expect(pedidoSchema.parse({ ...novoPedido(), itens: [cadastrado] }).itens[0]?.envioSeparado).toBe(true);
  });

  it('sugere caixas só para a remessa principal e preserva brinde próprio', () => {
    const proprio = itemDeProduto(produto, 1, true);
    const v = sugerirCaixas([externo('ext', 8), proprio]);
    expect(v).toHaveLength(1);
    expect(v[0]?.conteudo).toEqual([{ itemId: proprio.id, quantidade: 1 }]);
    expect(sugerirCaixas([externo('ext', 8)])).toEqual([]);
  });

  it('limpa volumes antigos mistos, preserva itens comuns e exige nova conferência', () => {
    const comum = itemDeProduto(produto, 2);
    const ext = externo('ext', 3);
    const vazia = volume('vazia', []);
    const volumes = [
      volume('misto', [{ itemId: comum.id, quantidade: 2 }, { itemId: ext.id, quantidade: 3 }]),
      volume('so-externo', [{ itemId: ext.id, quantidade: 3 }]),
      vazia,
    ];
    const limpos = volumesRemessaPrincipal([comum, ext], volumes);
    expect(limpos.map(v => v.id)).toEqual(['misto', 'vazia']);
    expect(limpos[0]).toMatchObject({ conteudo: [{ itemId: comum.id, quantidade: 2 }], pesoAjustadoG: null, confirmado: false });
    expect(limpos[1]).toEqual(vazia);
    expect(avaliarVolume(volumes[0]!, [comum, ext]).pesoProdutosG).toBe(900);
    expect(conferirDistribuicao([comum, ext], limpos)).toBe(true);
  });

  it('pedido somente com envio separado não exige caixa, peso, cotação ou pagador', () => {
    const p: Pedido = { ...novoPedido(), leadId, destinoCep: '01001000', endereco: 'Endereço sintético', itens: [externo('ext', 2)], status: 'confirmado' };
    expect(pendenciasPedido(p)).toEqual([]);
    expect(validarSalvar(p)).toEqual(p);
    expect(() => prepararRemessaFrete(p)).toThrow('não há remessa principal');
  });

  it('frete e total ignoram brinde separado mesmo com cotação antiga', () => {
    const ext = externo('ext', 2);
    const p = pedidoPronto([ext], [volume('antigo', [{ itemId: ext.id, quantidade: 2 }])]);
    expect(calcularPedido(p)).toMatchObject({ produtos: 0, frete: 0, freteCliente: 0, total: 0 });
    expect(normalizarRemessaPrincipal(p)).toMatchObject({ volumes: [], cotacaoId: null });
  });

  it('mudança somente no envio separado não invalida cotação dos produtos', () => {
    const comum = itemDeProduto(produto, 2);
    const ext = externo('ext', 1);
    const p = pedidoPronto([comum, ext]);
    const antes = assinaturaFrete(p);
    const depois = atualizarPedidoAutomatico(p, { itens: [comum, { ...ext, quantidade: 9 }] });
    expect(assinaturaFrete(depois)).toBe(antes);
    expect(depois.cotacaoId).toBe('c');
    expect(depois.volumes).toEqual(p.volumes);
    expect(calcularPedido(depois).frete).toBe(1500);
  });

  it('servidor canonicaliza origem e limpa pedidos antigos sem apagar itens', () => {
    const comum = itemDeProduto(produto, 2);
    const ext = externo('ext', 3);
    delete ext.envioSeparado;
    const separado = itemDeBrinde(reutilizavel(true));
    const p: Pedido = {
      ...novoPedido(), leadId, itens: [comum, ext, separado],
      volumes: [volume('misto', [{ itemId: comum.id, quantidade: 2 }, { itemId: ext.id, quantidade: 3 }, { itemId: separado.id, quantidade: 1 }])],
    };
    const doc = prepararDocumento(p, 'gestor', CATALOGO, [reutilizavel(true)], taxas, null);
    expect(doc.itens.map(i => [i.id, i.envioSeparado])).toEqual([[comum.id, false], [ext.id, true], [separado.id, true]]);
    expect(doc.itens).toHaveLength(3);
    expect(doc.volumes).toHaveLength(1);
    expect(doc.volumes[0]?.conteudo).toEqual([{ itemId: comum.id, quantidade: 2 }]);
    const anterior: Pedido = { ...novoPedido(), leadId, itens: [separado] };
    const historico = prepararDocumento(anterior, 'gestor', CATALOGO, [], taxas, anterior);
    expect(historico.itens[0]?.envioSeparado).toBe(true);
  });

  it('remessa do servidor exclui volumes antigos de brindes e mantém o valor comum', () => {
    const comum = itemDeProduto(produto, 2);
    const ext = externo('ext', 4);
    const p = pedidoPronto([comum, ext], [
      volume('misto', [{ itemId: comum.id, quantidade: 2 }, { itemId: ext.id, quantidade: 4 }]),
      volume('so-externo', [{ itemId: ext.id, quantidade: 4 }]),
    ]);
    const limpo = normalizarRemessaPrincipal(p);
    const confirmado = { ...limpo, volumes: limpo.volumes.map(v => ({ ...v, confirmado: true })) };
    const remessa = prepararRemessaFrete(confirmado);
    expect(remessa).toHaveLength(1);
    expect(remessa[0]).toMatchObject({ id: 'misto', pesoG: 900, dimensoes: [23, 16, 17], declaradoCentavos: 10000 });
  });
});

describe('marcação explícita em pedido legado reaberto', () => {
  it('brinde reutilizável legado sem marcação sai das caixas ao ser marcado no item, sem afetar produto', async () => {
    const comum = itemDeProduto(produto, 2);
    const legado = { ...itemDeBrinde(reutilizavel()) };
    delete legado.envioSeparado;
    const anterior: Pedido = { ...novoPedido(), leadId, itens: [comum, legado], volumes: [volume('v8', [{ itemId: legado.id, quantidade: 1 }]), volume('v1', [{ itemId: comum.id, quantidade: 2 }])] };
    const mantido = prepararDocumento(anterior, 'gestor', CATALOGO, [reutilizavel()], taxas, anterior);
    expect(mantido.volumes).toHaveLength(2);
    const marcado: Pedido = { ...anterior, itens: [comum, { ...legado, envioSeparado: true }] };
    const doc = prepararDocumento(marcado, 'gestor', CATALOGO, [reutilizavel()], taxas, anterior);
    expect(doc.itens.map(i => i.envioSeparado)).toEqual([false, true]);
    expect(doc.volumes.map(v => v.id)).toEqual(['v1']);
    const { linhasProposta } = await import('./mimo-proposta');
    const linhas = linhasProposta({ numero: '1', versao: 1, cliente: 'X', pedido: doc });
    expect(linhas.some(l => l === '1 × Air Fryer sintética (Unidade) — BONIFICAÇÃO · Envio separado')).toBe(true);
    const produtoMarcado = prepararDocumento({ ...anterior, itens: [{ ...comum, envioSeparado: true }, legado] }, 'gestor', CATALOGO, [reutilizavel()], taxas, anterior);
    expect(produtoMarcado.itens[0]?.envioSeparado).toBe(false);
  });
});
