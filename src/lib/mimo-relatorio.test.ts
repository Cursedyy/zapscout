import { describe, it, expect } from 'vitest';
import { calcularDashboard, filtroDashboardSchema, type FiltroDashboard } from './mimo-dashboard';
import { calcularRelatorio, periodoAnterior, semanasDoPeriodo, celulaCsv, gerarCsv, csvLeads, csvMeta, csvPedidos, csvResumo, variacao, type LeadRel, type MetricaRel } from './mimo-relatorio';

const f = (o: Partial<FiltroDashboard> = {}) => filtroDashboardSchema.parse({ inicio: '2026-10-12', fim: '2026-10-18', ...o });
const L = (o: Partial<LeadRel>): LeadRel => ({ nome_empresa: 'Empório São João', nome_contato: 'José', anuncio_origem: '', entrada_em: '2026-10-13T12:00:00Z', perfil: 'emporio', origem: 'meta_ads', campanha_origem: 'Revenda', qualificacao: 'pendente', etapa: 'novo', conversao_em: null, valor_pedido: null, ...o });
const M = (o: Partial<MetricaRel>): MetricaRel => ({ data_inicio: '2026-10-13', data_fim: '2026-10-13', campanha: 'Revenda', conjunto: '', anuncio: '', investimento: 100, leads_meta: 40, impressoes: null, alcance: null, cliques: null, ...o });

const leads = [
  L({ qualificacao: 'qualificado', etapa: 'pedido_fechado', valor_pedido: 1234.5, conversao_em: '2026-10-15T12:00:00Z' }),
  L({ qualificacao: 'qualificado', origem: 'indicacao', campanha_origem: '' }),
  L({ entrada_em: '2026-10-07T12:00:00Z' }), L({ entrada_em: '2026-10-08T12:00:00Z', qualificacao: 'qualificado' }),
];
const metricas = [M({}), M({ data_inicio: '2026-10-06', data_fim: '2026-10-06', investimento: 50 })];

describe('relatório semanal MiMo', () => {
  it('usa exatamente os mesmos indicadores do dashboard', () => {
    const r = calcularRelatorio(f(), leads, metricas);
    expect(r.atual.indicadores).toEqual(calcularDashboard(f(), leads, metricas).indicadores);
    expect(r.atual.indicadores.investimento).toBe(100);
    expect(r.atual.indicadores.leadsGerados).toBe(2);
    expect(r.atual.indicadores.cacMidia).toBe(100);
  });
  it('compara com a semana anterior', () => {
    expect(periodoAnterior(f())).toMatchObject({ inicio: '2026-10-05', fim: '2026-10-11' });
    const c = Object.fromEntries(calcularRelatorio(f(), leads, metricas).comparacao.map(x => [x.indicador, x]));
    expect(c.investimento).toMatchObject({ atual: 100, anterior: 50, variacao: 100 });
    expect(c.cpl).toMatchObject({ atual: 50, anterior: 25 });
    expect(c.novosClientes.variacao).toBeNull(); // anterior 0 → sem variação
  });
  it('período sem dados não vira zero', () => {
    const r = calcularRelatorio(f(), [], []);
    expect(r.atual.indicadores).toMatchObject({ investimento: null, cpl: null, taxaQualificacao: null, cacMidia: null, leadsGerados: 0 });
    expect(variacao(null, 10)).toBeNull();
  });
  it('divide em semanas e marca semana parcial', () => {
    const s = semanasDoPeriodo(f({ inicio: '2026-10-01', fim: '2026-10-10' }));
    expect(s.map(x => [x.inicio, x.fim])).toEqual([['2026-10-01', '2026-10-07'], ['2026-10-08', '2026-10-10']]);
    expect(calcularRelatorio(f({ inicio: '2026-10-01', fim: '2026-10-10' }), leads, metricas).semanas[1].parcial).toBe(true);
  });
  it('filtros de origem e campanha valem para exportações', () => {
    const r = calcularRelatorio(f({ origem: 'indicacao' }), leads, metricas);
    expect(r.linhas.leads).toHaveLength(1);
    expect(r.linhas.meta).toHaveLength(0);
    expect(r.atual.indicadores.investimento).toBeNull();
    expect(calcularRelatorio(f({ campanha: 'Outra' }), leads, metricas).linhas.leads).toHaveLength(0);
  });
});

describe('CSV MiMo', () => {
  it('BOM, separador ; e acentos', () => {
    const csv = csvLeads(calcularRelatorio(f(), leads, metricas));
    expect(csv.startsWith('\uFEFFEmpresa;Contato;')).toBe(true);
    expect(csv).toContain('Empório São João;José;Empório;Meta Ads;Revenda;;13/10/2026;Pedido fechado;Qualificado');
  });
  it('valores monetários, vazios e datas', () => {
    const r = calcularRelatorio(f(), leads, metricas);
    expect(csvPedidos(r)).toContain('13/10/2026;15/10/2026;1234,5');
    expect(csvMeta(r)).toContain('13/10/2026;13/10/2026;Revenda;;;100;;;;40');
    expect(csvResumo(r)).toContain('Investimento em anúncios (R$);100;50;100');
  });
  it('neutraliza fórmulas e escapa aspas', () => {
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    for (const s of ['+1', '-2', '@SUM(A1)']) expect(celulaCsv(s).startsWith("'")).toBe(true);
    expect(celulaCsv('a;b')).toBe('"a;b"');
    expect(gerarCsv(['A'], [[null], [12.345]])).toBe('\uFEFFA\r\n\r\n12,35\r\n');
  });
  it('não exporta telefone nem identificadores internos', () => {
    const csv = csvLeads(calcularRelatorio(f(), leads, metricas));
    expect(csv).not.toMatch(/telefone|empresa_id|responsavel/i);
  });
});
