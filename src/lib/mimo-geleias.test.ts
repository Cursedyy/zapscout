import { describe, expect, it } from 'vitest';
import { avaliarVolume, CATALOGO, caixaDoVolume, itemDeProduto, sugerirCaixas } from './mimo-pedido';
import { CAIXAS_PADRAO, comCaixaGeleias } from './mimo-tira-regras';

const geleia = (q: number, c = 'M030') => itemDeProduto(CATALOGO.find(p => p.codigo === c)!, q);
const bolo = (q: number) => itemDeProduto(CATALOGO.find(p => p.codigo === 'M004')!, q);

describe('caixa GELEIAS', () => {
  it('GEL tem 36×27×15 cm e até 12 potes', () => {
    const gel = CAIXAS_PADRAO.find(c => c.id === 'GEL')!;
    expect(gel.dimensoes).toEqual([36, 27, 15]);
    expect(gel.geleias).toBe(12);
  });
  it('12 potes cabem em um volume de 4.680 g comprovado', () => {
    const itens = [geleia(12)]; const v = sugerirCaixas(itens);
    expect(v).toHaveLength(1); expect(v[0]!.caixa).toBe('GEL');
    const a = avaliarVolume(v[0]!, itens);
    expect(a.pesoCotacaoG).toBe(4680); expect(a.comprovado).toBe(true);
    expect(caixaDoVolume(v[0]!).dimensoes).toEqual([36, 27, 15]);
  });
  it('acima de 12 gera volumes adicionais com peso pela quantidade efetiva', () => {
    const itens = [geleia(10), geleia(5, 'M031')]; const v = sugerirCaixas(itens);
    expect(v.map(x => x.caixa)).toEqual(['GEL', 'GEL']);
    expect(v.map(x => avaliarVolume(x, itens).pesoCotacaoG)).toEqual([4680, 1170]);
  });
  it('não mistura geleias com outros tipos', () => {
    const itens = [geleia(3), bolo(4)]; const v = sugerirCaixas(itens);
    const gel = v.filter(x => x.caixa === 'GEL');
    expect(gel).toHaveLength(1);
    expect(gel[0]!.conteudo.map(c => c.itemId)).toEqual([itens[0]!.id]);
    expect(v.filter(x => x.caixa !== 'GEL').every(x => x.conteudo.every(c => c.itemId === itens[1]!.id))).toBe(true);
  });
  it('mais de 12 geleias numa caixa não é comprovado', () => {
    const itens = [geleia(13)];
    expect(avaliarVolume({ id: 'x', caixa: 'GEL', conteudo: [{ itemId: itens[0]!.id, quantidade: 13 }], pesoAjustadoG: null, confirmado: false }, itens).comprovado).toBe(false);
  });
  it('configuração existente recebe GEL sem duplicar e preserva as demais', () => {
    const antigas = CAIXAS_PADRAO.filter(c => c.id !== 'GEL');
    expect(comCaixaGeleias(antigas).map(c => c.id)).toEqual(['P', 'G', 'GEL']);
    const comGel = [...antigas, { id: 'GEL', nome: 'GELEIAS', dimensoes: [36, 27, 15] as [number, number, number], displays: 0, misturinhas: 0, ativo: true }];
    const r = comCaixaGeleias(comGel);
    expect(r.filter(c => c.id === 'GEL')).toHaveLength(1);
    expect(r.find(c => c.id === 'GEL')!.geleias).toBe(12);
    expect(r.slice(0, 2)).toEqual(antigas);
  });
});
