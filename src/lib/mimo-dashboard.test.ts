import { describe, it, expect } from 'vitest';
import { calcularDashboard, filtroDashboardSchema, type LeadDash, type MetricaDash } from './mimo-dashboard';

const f = (o: Partial<{ inicio: string; fim: string; campanha: string; origem: string }> = {}) => filtroDashboardSchema.parse({ inicio: '2026-10-01', fim: '2026-10-31', ...o });
const L = (o: Partial<LeadDash>): LeadDash => ({ entrada_em: '2026-10-05T12:00:00Z', perfil: 'emporio', origem: 'meta_ads', campanha_origem: 'Revenda', qualificacao: 'pendente', etapa: 'novo', conversao_em: null, valor_pedido: null, ...o });
const M = (o: Partial<MetricaDash>): MetricaDash => ({ data_inicio: '2026-10-02', data_fim: '2026-10-02', campanha: 'Revenda', investimento: 100, leads_meta: 50, ...o });

const leads = [
  L({ qualificacao: 'qualificado', etapa: 'pedido_fechado', valor_pedido: 900, conversao_em: '2026-10-10T12:00:00Z' }),
  L({ qualificacao: 'qualificado', perfil: 'farmacia' }),
  L({ perfil: 'supermercado', origem: 'indicacao', campanha_origem: '' }),
  L({ etapa: 'pedido_fechado', valor_pedido: 300, conversao_em: '2026-11-03T12:00:00Z' }), // conversão fora do período
  L({ entrada_em: '2026-09-30T12:00:00Z', qualificacao: 'qualificado' }), // fora do período
];
const metricas = [M({}), M({ data_inicio: '2026-10-03', data_fim: '2026-10-03', investimento: 300 }), M({ data_inicio: '2026-09-25', data_fim: '2026-10-05', investimento: 999 })];

describe('dashboard MiMo', () => {
  it('calcula os 8 indicadores com dados controlados', () => {
    const d = calcularDashboard(f(), leads, metricas).indicadores;
    expect(d.investimento).toBe(400);
    expect(d.leadsGerados).toBe(4);
    expect(d.cpl).toBe(100);
    expect(d.taxaQualificacao).toBe(50);
    expect(d.cpql).toBe(200);
    expect(d.novosClientes).toBe(1);
    expect(d.taxaConversao).toBe(25);
    expect(d.cacMidia).toBe(400);
  });
  it('leads por perfil', () => {
    expect(calcularDashboard(f(), leads, metricas).leadsPorPerfil).toEqual([{ perfil: 'emporio', total: 2 }, { perfil: 'farmacia', total: 1 }, { perfil: 'supermercado', total: 1 }]);
  });
  it('leads do Meta nunca entram nos leads do CRM', () => {
    const d = calcularDashboard(f(), leads, metricas);
    expect(d.avisos.leadsMeta).toBe(100);
    expect(d.indicadores.leadsGerados).toBe(4);
  });
  it('linha do Meta que cruza o período fica fora e é avisada', () => {
    expect(calcularDashboard(f(), leads, metricas).avisos.metaParciais).toBe(1);
  });
  it('denominador zero e dados ausentes viram vazio', () => {
    const d = calcularDashboard(f(), [], []).indicadores;
    expect([d.investimento, d.cpl, d.taxaQualificacao, d.cpql, d.taxaConversao, d.cacMidia]).toEqual([null, null, null, null, null, null]);
    expect(calcularDashboard(f(), leads, [M({ investimento: null })]).indicadores.investimento).toBeNull();
  });
  it('filtro por campanha e origem', () => {
    const c = calcularDashboard(f({ campanha: 'revenda' }), leads, [...metricas, M({ campanha: 'Outra', investimento: 50 })]).indicadores;
    expect(c.leadsGerados).toBe(3);
    expect(c.investimento).toBe(400);
    const o = calcularDashboard(f({ origem: 'indicacao' }), leads, metricas);
    expect(o.indicadores.leadsGerados).toBe(1);
    expect(o.indicadores.investimento).toBeNull();
  });
  it('sem pedido fechado com valor não é cliente', () => {
    const d = calcularDashboard(f(), [L({ etapa: 'pedido_fechado', valor_pedido: null, conversao_em: '2026-10-06T00:00:00Z' })], []).indicadores;
    expect(d.novosClientes).toBe(0);
  });
  it('avisa cliente sem campanha', () => {
    const d = calcularDashboard(f(), [L({ campanha_origem: '', etapa: 'pedido_fechado', valor_pedido: 1, conversao_em: '2026-10-06T00:00:00Z' })], []);
    expect(d.avisos.clientesSemCampanha).toBe(1);
    expect(d.avisos.leadsMetaSemCampanha).toBe(1);
  });
  it('recusa período invertido ou maior que um ano', () => {
    expect(() => f({ inicio: '2026-10-31', fim: '2026-10-01' })).toThrow();
    expect(() => f({ inicio: '2025-01-01', fim: '2026-10-01' })).toThrow();
  });
});
