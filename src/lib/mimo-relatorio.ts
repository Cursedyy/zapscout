import { z } from 'zod';
import { calcularDashboard, filtrarLeadsPeriodo, filtrarMetricasPeriodo, ehPedidoFechado, type FiltroDashboard, type LeadDash, type MetricaDash } from '@/lib/mimo-dashboard';
import { ORIGENS, PERFIS, ETAPAS, QUALIFICACOES } from '@/lib/mimo-leads';

// Weekly report: reuses the dashboard math for the period, the equally long previous period and each 7-day block.
export const filtroRelatorioSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  campanha: z.string().trim().max(200).default(''),
  origem: z.enum(['', 'meta_ads', 'whatsapp', 'indicacao', 'organico', 'outra']).default(''),
}).refine(v => v.inicio <= v.fim, 'Período inválido.')
  .refine(v => (Date.parse(v.fim) - Date.parse(v.inicio)) / 86400000 <= 91, 'Escolha no máximo 13 semanas.');

export type LeadRel = LeadDash & { nome_empresa: string; nome_contato: string; anuncio_origem: string };
export type MetricaRel = MetricaDash & { conjunto: string; anuncio: string; impressoes: number | null; alcance: number | null; cliques: number | null };

const somaDias = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const dias = (f: { inicio: string; fim: string }) => Math.round((Date.parse(f.fim) - Date.parse(f.inicio)) / 86400000) + 1;
export const periodoAnterior = (f: FiltroDashboard): FiltroDashboard => ({ ...f, inicio: somaDias(f.inicio, -dias(f)), fim: somaDias(f.inicio, -1) });
export const semanasDoPeriodo = (f: FiltroDashboard): FiltroDashboard[] => {
  const out: FiltroDashboard[] = [];
  for (let i = f.inicio; i <= f.fim; i = somaDias(i, 7)) { const fim = somaDias(i, 6); out.push({ ...f, inicio: i, fim: fim > f.fim ? f.fim : fim }); }
  return out;
};
export const variacao = (atual: number | null, anterior: number | null) => (atual === null || anterior === null || anterior === 0 ? null : ((atual - anterior) / anterior) * 100);

export function calcularRelatorio(f: FiltroDashboard, leads: LeadRel[], metricas: MetricaRel[]) {
  const atual = calcularDashboard(f, leads, metricas);
  const ant = periodoAnterior(f);
  const anterior = calcularDashboard(ant, leads, metricas);
  const semanas = semanasDoPeriodo(f).map(s => {
    const d = calcularDashboard(s, leads, metricas);
    return { inicio: s.inicio, fim: s.fim, parcial: dias(s) < 7, ...d.indicadores };
  });
  const doPeriodo = filtrarLeadsPeriodo(f, leads);
  const porOrigem: Record<string, number> = {};
  for (const l of doPeriodo) porOrigem[l.origem] = (porOrigem[l.origem] ?? 0) + 1;
  const chaves = ['investimento', 'leadsGerados', 'cpl', 'taxaQualificacao', 'cpql', 'novosClientes', 'receita', 'taxaConversao', 'cacMidia'] as const;
  const comparacao = chaves.map(k => ({ indicador: k, atual: atual.indicadores[k], anterior: anterior.indicadores[k], variacao: variacao(atual.indicadores[k], anterior.indicadores[k]) }));
  return {
    filtro: f, anteriorPeriodo: { inicio: ant.inicio, fim: ant.fim },
    atual, comparacao, semanas,
    leadsPorOrigem: Object.entries(porOrigem).map(([origem, total]) => ({ origem, total })).sort((a, b) => b.total - a.total),
    linhas: {
      leads: doPeriodo.map(l => ({ nome_empresa: l.nome_empresa, nome_contato: l.nome_contato, perfil: l.perfil, origem: l.origem, campanha_origem: l.campanha_origem, anuncio_origem: l.anuncio_origem, entrada_em: l.entrada_em, etapa: l.etapa, qualificacao: l.qualificacao })),
      pedidos: doPeriodo.filter(l => ehPedidoFechado(f, l)).map(l => ({ nome_empresa: l.nome_empresa, perfil: l.perfil, origem: l.origem, campanha_origem: l.campanha_origem, entrada_em: l.entrada_em, conversao_em: l.conversao_em!, valor_pedido: l.valor_pedido! })),
      meta: (f.origem && f.origem !== 'meta_ads' ? [] : filtrarMetricasPeriodo(f, metricas)).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio) || a.campanha.localeCompare(b.campanha)),
    },
  };
}
export type Relatorio = ReturnType<typeof calcularRelatorio>;

// ---------- CSV (Excel pt-BR: UTF-8 com BOM, separador ;) ----------
export const ROTULO_INDICADOR: Record<string, string> = {
  investimento: 'Investimento em anúncios (R$)', leadsGerados: 'Leads gerados no CRM', cpl: 'CPL (R$)', taxaQualificacao: 'Taxa de qualificação (%)',
  cpql: 'CPQL (R$)', novosClientes: 'Pedidos fechados (quantidade)', receita: 'Pedidos fechados (R$)', taxaConversao: 'Taxa de conversão (%)', cacMidia: 'CAC de mídia (R$)',
};
type Celula = string | number | null | undefined;
export function celulaCsv(v: Celula): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '') : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutraliza fórmulas no Excel
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const gerarCsv = (cab: string[], linhas: Celula[][]) => '\uFEFF' + [cab, ...linhas].map(l => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
export const dataBr = (iso: string | null) => (iso ? (iso.length === 10 ? iso : new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 10)).split('-').reverse().join('/') : '');
const rot = (m: Record<string, string>, k: string) => m[k] ?? k;

export function csvResumo(r: Relatorio) {
  const per = `${dataBr(r.filtro.inicio)} a ${dataBr(r.filtro.fim)}`;
  const linhas: Celula[][] = r.comparacao.map(c => [ROTULO_INDICADOR[c.indicador], c.atual, c.anterior, c.variacao]);
  linhas.push(['Leads informados pelo Meta (referência, não somados ao CRM)', r.atual.avisos.leadsMeta, null, null]);
  linhas.push(['Filtro de campanha', r.filtro.campanha || 'Todas', null, null], ['Filtro de origem', r.filtro.origem ? rot(ORIGENS, r.filtro.origem) : 'Todas', null, null]);
  return gerarCsv(['Indicador', `Período (${per})`, `Período anterior (${dataBr(r.anteriorPeriodo.inicio)} a ${dataBr(r.anteriorPeriodo.fim)})`, 'Variação (%)'], linhas);
}
export const csvLeads = (r: Relatorio) => gerarCsv(['Empresa', 'Contato', 'Perfil', 'Origem', 'Campanha', 'Anúncio', 'Entrada', 'Etapa', 'Qualificação'],
  r.linhas.leads.map(l => [l.nome_empresa, l.nome_contato, rot(PERFIS, l.perfil), rot(ORIGENS, l.origem), l.campanha_origem, l.anuncio_origem, dataBr(l.entrada_em), rot(ETAPAS, l.etapa), rot(QUALIFICACOES, l.qualificacao)]));
export const csvMeta = (r: Relatorio) => gerarCsv(['Data início', 'Data fim', 'Campanha', 'Conjunto', 'Anúncio', 'Investimento (R$)', 'Impressões', 'Alcance', 'Cliques', 'Leads informados pelo Meta'],
  r.linhas.meta.map(m => [dataBr(m.data_inicio), dataBr(m.data_fim), m.campanha, m.conjunto, m.anuncio, m.investimento, m.impressoes, m.alcance, m.cliques, m.leads_meta]));
export const csvPedidos = (r: Relatorio) => gerarCsv(['Empresa', 'Perfil', 'Origem', 'Campanha', 'Entrada', 'Conversão', 'Valor do pedido (R$)'],
  r.linhas.pedidos.map(p => [p.nome_empresa, rot(PERFIS, p.perfil), rot(ORIGENS, p.origem), p.campanha_origem, dataBr(p.entrada_em), dataBr(p.conversao_em), p.valor_pedido]));
