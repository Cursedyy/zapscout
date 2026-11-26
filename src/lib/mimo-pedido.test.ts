import { describe, expect, it } from 'vitest';
import { CATALOGO, MODELOS, calcularPedido, carregarModelo, conferirDistribuicao, dividirParcelas, itemDeProduto, moverItem, novoPedido, pendenciasPedido, podeAcessarPedido, sugerirCaixas, taxaCartao, vencimentosBoleto, assinaturaFrete, avaliarVolume, validarSalvar, indicadoresPedidos, centavos, type Pedido, type PedidoSalvo } from '@/lib/mimo-pedido';
import { linhasProposta, mensagemWhatsApp } from '@/lib/mimo-proposta';

function at<T>(a:T[],i:number):T{const v=a[i];if(v===undefined)throw new Error('Item de teste inexistente.');return v;}
const ativos = CATALOGO.filter(p => p.ativo);
const pedidoModelo = (i: number) => ({ ...novoPedido(), itens: carregarModelo(at(MODELOS,i), CATALOGO) });
function pronto(p: Pedido): Pedido { const volumes = sugerirCaixas(p.itens).map(v => ({ ...v, confirmado: true })); const base = { ...p, leadId: '00000000-0000-4000-8000-000000000001', destinoCep: '01001000', endereco: 'Rua A', volumes, fretePagador: 'cliente' as const }; return { ...base, cotacoes: [{ id: 'c', modalidade: 'Package', prazo: '3 dias', modo: 'remessa', valor: 5000, valoresVolumes: {}, assinatura: assinaturaFrete(base), registradaEm: new Date().toISOString(), oficial: true }], cotacaoId: 'c' }; }

describe('catálogo e modelos', () => {
  it('tem 16 produtos comerciais com os preços e embalagens aprovados', () => {
    expect(ativos).toHaveLength(16);
    expect(ativos.find(p => p.codigo === 'M014')).toMatchObject({ preco: 1538, caixaP: 8, caixaG: 16 });
    expect(ativos.filter(p => p.tipo === 'display').map(p => p.preco)).toEqual([5670, 5910, 5280]);
    expect(ativos.filter(p => p.tipo === 'display').every(p => p.pesoG === 450 && p.unidade === 'Display de 15' && p.caixaP === 4 && p.caixaG === 8)).toBe(true);
    expect(ativos.filter(p => p.categoria === 'Geleias').map(p => p.preco)).toEqual([3743, 3750, 3635, 3626]);
    expect(ativos.find(p => p.codigo === 'M030')).toMatchObject({ pesoG: 390, caixaP: null, caixaG: 12 });
  });
  it('mantém produtos futuros inativos e sem dados inventados', () => { const f = CATALOGO.filter(p => !p.ativo); expect(f).toHaveLength(13); expect(f.every(p => p.preco === null && p.pesoG === null)).toBe(true); expect(() => itemDeProduto(at(f,0))).toThrow(); });
  it.each([[0, 45706], [1, 89965], [2, 144610]])('modelo %i soma o valor de referência', (i, total) => expect(calcularPedido(pedidoModelo(i)).total).toBe(total));
  it('calcula o exemplo da planilha com os preços apresentados em centavos', () => {
    const modelo = { id: 'exemplo', nome: 'Exemplo', itens: [
      ...['M001', 'M002', 'M003'].map(codigo => ({ codigo, quantidade: 16 })),
      ...['M004', 'M006', 'M007', 'M005', 'M008', 'M009'].map(codigo => ({ codigo, quantidade: 9 })),
      ...['M030', 'M031', 'M032', 'M033'].map(codigo => ({ codigo, quantidade: 12 })),
    ] };
    const itens = carregarModelo(modelo, CATALOGO);
    expect(itens.reduce((soma, item) => soma + item.quantidade, 0)).toBe(150);
    expect(calcularPedido({ ...novoPedido(), itens }).produtos).toBe(502707);
  });
  it('alterar o pedido não altera o modelo', () => { const p = pedidoModelo(1); at(p.itens,0).quantidade = 99; expect(at(at(MODELOS,1).itens,0).quantidade).toBe(4); });
  it('recusa quantidade zero ou negativa', () => { const p = pedidoModelo(0); at(p.itens,0).quantidade = 0; expect(() => validarSalvar(p)).toThrow(); });
});
describe('descontos, brindes e pagamentos', () => {
  it('aplica desconto individual antes do geral', () => { const p = { ...novoPedido(), itens: [{ ...itemDeProduto(at(ativos,0), 2), precoNegociado: 5000, desconto: { modo: 'fixo' as const, valor: 1000 } }], descontoGeral: { modo: 'percentual' as const, valor: 1000 } }; expect(calcularPedido(p).produtos).toBe(8100); });
  it('brinde tem venda zero e custo interno fora da proposta', () => { const p = { ...novoPedido(), itens: [{ ...itemDeProduto(at(ativos,0)), brinde: true, custoInterno: 999 }] }; expect(calcularPedido(p).total).toBe(0); expect(linhasProposta({ numero: '1', versao: 1, cliente: 'X', pedido: p }).join(' ')).not.toContain('9,99'); });
  it('usa as taxas do cartão por faixa', () => expect([1, 2, 6, 7, 12].map(taxaCartao)).toEqual([313, 368, 368, 589, 589]));
  it('repassa taxa só sobre produtos e soma frete depois', () => { const p = pronto(pedidoModelo(1)); p.pagamento = { ...p.pagamento, forma: 'cartao', parcelas: 3, taxaBps: 368 }; const r = calcularPedido(p); expect(r.brutoProdutos).toBe(Math.ceil(89965 * 10000 / 9632)); expect(r.total).toBe(r.brutoProdutos + 5000); expect(r.absorvido).toBeGreaterThan(0); });
  it('divide parcelas preservando centavos', () => expect(dividirParcelas(1001, 3)).toEqual([334, 334, 333]));
  it('calcula vencimentos do boleto pelo faturamento', () => expect(vencimentosBoleto(1000, ['14', '42'], '2026-01-01')).toEqual([{ dias: 14, valor: 500, vencimento: '2026-01-15' }, { dias: 42, valor: 500, vencimento: '2026-02-12' }]));
  it('bloqueia faturar PIX sem confirmação', () => { const p = { ...pronto(pedidoModelo(0)), status: 'faturado' as const, pagamento: { ...novoPedido().pagamento, faturadoEm: '2026-01-01' } }; expect(pendenciasPedido(p)).toContain('Confirme o recebimento PIX antes de faturar ou enviar.'); expect(pendenciasPedido(p, { confirmadoEm: 'x', usuarioId: 'u', valor: 1 })).toEqual([]); });
  it('converte reais para centavos sem ponto flutuante', () => { expect(centavos('10,39')).toBe(1039); expect(() => centavos('1,999')).toThrow(); });
});
describe('caixas e frete', () => {
  it('usa a mistura P comprovada 2+6', () => { const v = sugerirCaixas([{ ...itemDeProduto(at(ativos,0), 2) }, { ...itemDeProduto(at(ativos,4), 6) }]); expect(v).toHaveLength(1); expect(at(v,0).caixa).toBe('P');  });
  it('distribui todo o PDV Completo e calcula pesos reais', () => { const p = pedidoModelo(2); const v = sugerirCaixas(p.itens); expect(conferirDistribuicao(p.itens, v)).toBe(true); expect(v.reduce((s, x) => s + (avaliarVolume(x, p.itens).pesoProdutosG ?? 0), 0)).toBe(16 * 450 + 50 * 300); });
  it('preserva a quantidade ao mover itens', () => { const p = pedidoModelo(1); const v = sugerirCaixas(p.itens); const c = at(at(v,0).conteudo,0); const m = moverItem(v, at(v,0).id, at(v,1).id, c.itemId, 1); expect(conferirDistribuicao(p.itens, m)).toBe(true); expect(at(m,1).confirmado).toBe(false); });
  it('marca aproximação sem garantir encaixe', () => { const p = pedidoModelo(0); const v = [{ id: 'v', caixa: 'P' as const, conteudo: p.itens.map(i => ({ itemId: i.id, quantidade: i.quantidade })), pesoAjustadoG: null, confirmado: false }]; expect(avaliarVolume(at(v,0), p.itens).comprovado).toBe(false); });
  it('invalida cotação quando endereço muda', () => { const p = pronto(pedidoModelo(0)); expect(pendenciasPedido({ ...p, status: 'confirmado' })).toEqual([]); expect(pendenciasPedido({ ...p, destinoCep: '02002000' })).toContain('Registre e selecione uma cotação atual.'); });
  it('soma fretes por volume sem duplicar', () => { const p = pronto(pedidoModelo(1)); const valores = Object.fromEntries(p.volumes.map(v => [v.id, 1000])); p.cotacoes = [{ ...at(p.cotacoes,0), modo: 'volumes', valor: 0, valoresVolumes: valores }]; expect(calcularPedido(p).frete).toBe(p.volumes.length * 1000); });
  it('frete pago pela MiMo não entra no total', () => { const p = { ...pronto(pedidoModelo(0)), fretePagador: 'mimo' as const }; expect(calcularPedido(p).total).toBe(45706); });
});
describe('permissões, indicadores e propostas', () => {
  const pedido = { empresaId: 'e', responsavelId: 'v1' };
  it('separa administrador, gestor, vendedor e outra empresa', () => { expect(podeAcessarPedido(true, { ativo: true, papel: 'administrador', usuarioId: 'a', empresaId: 'e' }, pedido)).toBe(true); expect(podeAcessarPedido(true, { ativo: true, papel: 'gestor', usuarioId: 'g', empresaId: 'e' }, pedido)).toBe(true); expect(podeAcessarPedido(true, { ativo: true, papel: 'vendedor', usuarioId: 'v2', empresaId: 'e' }, pedido)).toBe(false); expect(podeAcessarPedido(true, { ativo: true, papel: 'administrador', usuarioId: 'a', empresaId: 'x' }, pedido)).toBe(false); });
  it('cancelados saem dos indicadores sem perder registro', () => { const doc = pronto(pedidoModelo(0)); const base = { id: '1', numero: 1, versao: 1, empresa_id: 'e', lead_id: 'l', documento: doc, pix: null, created_at: '', updated_at: '', total: 100, produtos: 100, frete: 50 }; const lista = [{ ...base, status: 'confirmado', recebimentos: [{ confirmadoEm: '', usuarioId: '', valor: 100 }] }, { ...base, id: '2', status: 'cancelado', recebimentos: [] }] as PedidoSalvo[]; expect(indicadoresPedidos(lista)).toMatchObject({ confirmados: 1, receitaCobrada: 100, recebidos: 100, fretes: 50 }); expect(lista).toHaveLength(2); });
  it('texto ao cliente mostra só o número real, sem versão nem status', () => { const t = mensagemWhatsApp({ numero: '12', versao: 3, cliente: 'Loja', pedido: pedidoModelo(0) }); expect(t).toContain('Proposta MiMo · Pedido 12\n'); expect(t).not.toContain('versão'); expect(t).not.toContain('Status:'); });
  it('rascunho não salvo não expõe rótulo interno ao cliente', () => { const t = mensagemWhatsApp({ numero: 'RASCUNHO NÃO SALVO', versao: 0, cliente: 'Layane', pedido: pedidoModelo(0) }); expect(t).not.toContain('RASCUNHO'); expect(t).not.toContain('versão 0'); expect(t).toContain('Proposta MiMo\nCliente: Layane'); });
});
