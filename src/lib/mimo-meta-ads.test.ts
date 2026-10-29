import { describe, it, expect } from 'vitest';
import { analisarCsvMeta, parseData, parseNumero, sha256Hex } from './mimo-meta-ads';

const pt = `"Nome da campanha";"Nome do conjunto de anúncios";"Nome do anúncio";"Dia";"Valor usado (BRL)";"Impressões";"Alcance";"Cliques no link";"Leads"
Revenda;Público A;Vídeo 1;01/10/2026;1.234,56;10.000;8000;120;15
Revenda;Público A;Vídeo 1;02/10/2026;50,00;900;800;;3`;

describe('Meta Ads CSV', () => {
  it('CSV válido em português', () => {
    const r = analisarCsvMeta(pt);
    expect(r.erroGeral).toBeNull();
    expect(r.validas).toHaveLength(2);
    expect(r.validas[0]).toMatchObject({ data_inicio: '2026-10-01', investimento: 1234.56, impressoes: 10000, cliques: 120, leads_meta: 15 });
    expect(r.somas.investimento).toBe(1284.56);
    expect(r.periodo).toEqual({ inicio: '2026-10-01', fim: '2026-10-02' });
  });
  it('campo vazio fica nulo, não zero', () => {
    expect(analisarCsvMeta(pt).validas[1].cliques).toBeNull();
  });
  it('CSV em inglês com vírgula e intervalo de datas', () => {
    const r = analisarCsvMeta('Campaign name,Reporting starts,Reporting ends,Amount spent (BRL),Leads\nX,2026-10-01,2026-10-07,"1,234.50",4');
    expect(r.validas[0]).toMatchObject({ data_fim: '2026-10-07', investimento: 1234.5, leads_meta: 4, impressoes: null });
    expect(r.ausentes).toContain('impressoes');
  });
  it('arquivo vazio ou sem dados', () => {
    expect(analisarCsvMeta('').erroGeral).toMatch(/vazio/);
    expect(analisarCsvMeta('Nome da campanha;Dia').erroGeral).toMatch(/linhas de dados/);
  });
  it('colunas obrigatórias ausentes', () => {
    expect(analisarCsvMeta('foo;bar\n1;2').erroGeral).toMatch(/Campanha e Data/);
  });
  it('valores e datas inválidos geram erro por linha', () => {
    const r = analisarCsvMeta('Nome da campanha;Dia;Valor usado (BRL);Impressões\nA;31/02/2026;10;5\nB;01/10/2026;abc;5\nC;01/10/2026;10;1,5\n;01/10/2026;1;1');
    expect(r.validas).toHaveLength(0);
    expect(r.erros.map(e => e.motivo)).toEqual(['data inválida', 'investimento inválido', 'impressões deve ser inteiro', 'campanha vazia']);
  });
  it('linhas duplicadas no arquivo são excluídas, sem somar', () => {
    const r = analisarCsvMeta('Nome da campanha;Dia;Valor usado (BRL)\nA;01/10/2026;10\n a ;2026-10-01;10');
    expect(r.validas).toHaveLength(1);
    expect(r.duplicadas).toBe(1);
    expect(r.somas.investimento).toBe(10);
  });
  it('datas e moedas', () => {
    expect(parseData('2026-02-29')).toBeNull();
    expect(parseData('29/02/2028')).toBe('2028-02-29');
    expect(parseNumero('R$ 1.000,10')).toBe(1000.1);
    expect(parseNumero('1.000')).toBe(1000);
    expect(parseNumero('')).toBeNull();
    expect(parseNumero('-5')).toBeNaN();
  });
  it('mesmo arquivo gera mesmo hash (reimportação bloqueada)', async () => {
    expect(await sha256Hex(pt)).toBe(await sha256Hex(pt.replace(/\n/g, '\r\n')));
  });
});
