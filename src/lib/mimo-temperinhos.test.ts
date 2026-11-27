import { describe, expect, it } from 'vitest';
import { avaliarVolume, caixaDoVolume, conferirDistribuicao, ehTemperinho, itemDeProduto, sugerirCaixas, type Produto } from './mimo-pedido';
import { atualizarPedidoAutomatico } from './mimo-pedido-automatico';
import { CAIXAS_PADRAO, caixaConfere, caixaTipoSchema, prepararCaixas, type CaixaTipo } from './mimo-tira-regras';
import { novoPedido } from './mimo-pedido';

const temperinho = (codigo: string, nome: string): Produto => ({ codigo, nome, categoria: 'Temperinhos', unidade: 'Unidade', tipo: 'outro', pesoG: 120, preco: 2014, caixaP: null, caixaG: 12, ativo: true, descricao: '' });
const hortinha = temperinho('M027', 'Temperinho Mágico Hortinha 120 g');
const douradinho = temperinho('M028', 'Temperinho Mágico Douradinho 120 g');
const bolo: Produto = { codigo: 'M004', nome: 'Bolo Chocolate 300 g', categoria: 'Bolos', unidade: 'Unidade', tipo: 'misturinha', pesoG: 300, preco: 1017, caixaP: 8, caixaG: 16, ativo: true, descricao: '' };
const TMP: CaixaTipo = { id: 'TMP', nome: 'TEMPERINHOS', dimensoes: [26, 20, 18], displays: 0, misturinhas: 0, temperinhos: 12, ativo: true };
const caixas = [...CAIXAS_PADRAO, TMP];

describe('caixa de temperinhos', () => {
  it('reconhece temperinhos pelo nome, sem pegar brindes', () => {
    expect(ehTemperinho(itemDeProduto(hortinha, 1))).toBe(true);
    expect(ehTemperinho({ ...itemDeProduto(hortinha, 1), brinde: true })).toBe(false);
    expect(ehTemperinho(itemDeProduto(bolo, 1))).toBe(false);
  });
  it('cadastro aceita a capacidade de temperinhos', () => {
    expect(caixaTipoSchema.parse(TMP).temperinhos).toBe(12);
  });
  it('48 potes viram 4 volumes TMP de 12, comprovados, com peso real', () => {
    const itens = [itemDeProduto(hortinha, 48)];
    const v = sugerirCaixas(itens, caixas);
    expect(v.map(x => x.caixa)).toEqual(['TMP', 'TMP', 'TMP', 'TMP']);
    for (const x of v) {
      const a = avaliarVolume(x, itens);
      expect(a.comprovado).toBe(true);
      expect(a.pesoCotacaoG).toBe(1440);
      expect(caixaDoVolume(x).dimensoes).toEqual([26, 20, 18]);
      expect(caixas.some(c => c.id === x.caixa && caixaConfere(c, caixaDoVolume(x)))).toBe(true);
    }
    expect(conferirDistribuicao(itens, v)).toBe(true);
  });
  it('sabores diferentes completam a mesma caixa e nunca se misturam com outros produtos', () => {
    const itens = [itemDeProduto(hortinha, 10), itemDeProduto(douradinho, 5), itemDeProduto(bolo, 8)];
    const v = sugerirCaixas(itens, caixas);
    const tmp = v.filter(x => x.caixa === 'TMP');
    expect(tmp.map(x => x.conteudo.reduce((s, c) => s + c.quantidade, 0))).toEqual([12, 3]);
    expect(tmp.every(x => x.conteudo.every(c => c.itemId !== itens[2]!.id))).toBe(true);
    expect(conferirDistribuicao(itens, v)).toBe(true);
  });
  it('acima da capacidade ou misturado não é comprovado', () => {
    const itens = [itemDeProduto(hortinha, 13), itemDeProduto(bolo, 1)];
    const base = { id: 'x', caixa: 'TMP', tipoCaixa: { nome: 'TEMPERINHOS', dimensoes: [26, 20, 18] as [number, number, number], displays: 0, misturinhas: 0, temperinhos: 12 }, pesoAjustadoG: null, confirmado: false };
    expect(avaliarVolume({ ...base, conteudo: [{ itemId: itens[0]!.id, quantidade: 13 }] }, itens).comprovado).toBe(false);
    expect(avaliarVolume({ ...base, conteudo: [{ itemId: itens[0]!.id, quantidade: 6 }, { itemId: itens[1]!.id, quantidade: 1 }] }, itens).comprovado).toBe(false);
  });
  it('sem caixa de temperinhos cadastrada mantém o volume G a conferir', () => {
    const itens = [itemDeProduto(hortinha, 48)];
    const v = sugerirCaixas(itens, CAIXAS_PADRAO);
    expect(v).toHaveLength(1);
    expect(v[0]!.caixa).toBe('G');
    expect(avaliarVolume(v[0]!, itens).comprovado).toBe(false);
  });
  it('caixa TMP inativa não é usada', () => {
    const v = sugerirCaixas([itemDeProduto(hortinha, 12)], [...CAIXAS_PADRAO, { ...TMP, ativo: false }]);
    expect(v[0]!.caixa).toBe('G');
  });
  it('o servidor aceita a fotografia da caixa sugerida e recusa dimensões divergentes', () => {
    const itens = [itemDeProduto(hortinha, 12)];
    const p = { ...novoPedido(), itens, volumes: sugerirCaixas(itens, caixas) };
    expect(prepararCaixas(p, caixas, null).volumes[0]!.tipoCaixa).toEqual({ nome: 'TEMPERINHOS', dimensoes: [26, 20, 18], displays: 0, misturinhas: 0, temperinhos: 12 });
    const alterada = caixas.map(c => c.id === 'TMP' ? { ...c, dimensoes: [26, 20, 20] as [number, number, number] } : c);
    expect(() => prepararCaixas(p, alterada, null)).toThrow('Dimensões da caixa divergentes');
  });
  it('a sugestão automática do rascunho usa a caixa cadastrada', () => {
    const p = atualizarPedidoAutomatico(novoPedido(), { itens: [itemDeProduto(hortinha, 24)] }, caixas);
    expect(p.volumes.map(v => v.caixa)).toEqual(['TMP', 'TMP']);
  });
});
