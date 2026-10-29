import { z } from 'zod';

// Pure, client-safe calculation of the MiMo commercial dashboard.
// Cohort rule: every metric uses only the leads that ENTERED in the period, and only
// Meta rows fully contained in the same period, so numerators and denominators never mix periods.

export const filtroDashboardSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  campanha: z.string().trim().max(200).default(''),
  origem: z.enum(['', 'meta_ads', 'whatsapp', 'indicacao', 'organico', 'outra']).default(''),
}).refine(v => v.inicio <= v.fim, 'Período inválido.')
  .refine(v => (Date.parse(v.fim) - Date.parse(v.inicio)) / 86400000 <= 366, 'Escolha no máximo 1 ano.');
export type FiltroDashboard = z.infer<typeof filtroDashboardSchema>;

export type LeadDash = { entrada_em: string; perfil: string; origem: string; campanha_origem: string; qualificacao: string; etapa: string; conversao_em: string | null; valor_pedido: number | null };
export type MetricaDash = { data_inicio: string; data_fim: string; campanha: string; investimento: number | null; leads_meta: number | null };

const TZ = '-03:00'; // America/Sao_Paulo (sem horário de verão desde 2019)
export const limitesPeriodo = (f: { inicio: string; fim: string }) => ({ de: `${f.inicio}T00:00:00${TZ}`, ate: `${f.fim}T23:59:59.999${TZ}` });
export const diaLocal = (iso: string) => new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 10);
export const razao = (n: number | null, d: number) => (n === null || d === 0 ? null : n / d);
const arred = (v: number) => Math.round(v * 100) / 100;

// Shared cohort filters, also used by the weekly report and CSV exports so they never diverge.
export function filtrarLeadsPeriodo<T extends Pick<LeadDash, 'entrada_em' | 'origem' | 'campanha_origem'>>(f: FiltroDashboard, leads: T[]) {
  const { de, ate } = limitesPeriodo(f);
  const campanha = f.campanha.trim().toLowerCase();
  return leads.filter(l => {
    const t = Date.parse(l.entrada_em);
    return t >= Date.parse(de) && t <= Date.parse(ate)
      && (!f.origem || l.origem === f.origem)
      && (!campanha || l.campanha_origem.trim().toLowerCase() === campanha);
  });
}
export function filtrarMetricasPeriodo<T extends Pick<MetricaDash, 'data_inicio' | 'data_fim' | 'campanha'>>(f: FiltroDashboard, metricas: T[]) {
  const campanha = f.campanha.trim().toLowerCase();
  return metricas.filter(m => m.data_inicio >= f.inicio && m.data_fim <= f.fim && (!campanha || m.campanha.trim().toLowerCase() === campanha));
}
export const ehPedidoFechado = (f: FiltroDashboard, l: Pick<LeadDash, 'etapa' | 'valor_pedido' | 'conversao_em'>) =>
  l.etapa === 'pedido_fechado' && l.valor_pedido !== null && !!l.conversao_em && Date.parse(l.conversao_em) <= Date.parse(limitesPeriodo(f).ate);

export function calcularDashboard(f: FiltroDashboard, leadsBrutos: LeadDash[], metricasBrutas: MetricaDash[]) {
  const { ate } = limitesPeriodo(f);
  const leads = filtrarLeadsPeriodo(f, leadsBrutos);
  const dentro = filtrarMetricasPeriodo(f, metricasBrutas);
  const parciais = metricasBrutas.filter(m => m.data_inicio <= f.fim && m.data_fim >= f.inicio && !(m.data_inicio >= f.inicio && m.data_fim <= f.fim)).length;
  // Investment only makes sense when the lead universe can contain Meta leads.
  const investimentoAplicavel = !f.origem || f.origem === 'meta_ads';
  const comInvest = dentro.filter(m => m.investimento !== null);
  const investimento = investimentoAplicavel && comInvest.length ? arred(comInvest.reduce((s, m) => s + (m.investimento ?? 0), 0)) : null;
  const comLeadsMeta = dentro.filter(m => m.leads_meta !== null);
  const leadsMeta = comLeadsMeta.length ? comLeadsMeta.reduce((s, m) => s + (m.leads_meta ?? 0), 0) : null;

  const gerados = leads.length;
  const qualificados = leads.filter(l => l.qualificacao === 'qualificado').length;
  const clientes = leads.filter(l => ehPedidoFechado(f, l));
  void ate;
  const novosClientes = clientes.length;
  const receita = arred(clientes.reduce((s, l) => s + (l.valor_pedido ?? 0), 0));

  const porPerfil: Record<string, number> = {};
  for (const l of leads) porPerfil[l.perfil] = (porPerfil[l.perfil] ?? 0) + 1;

  const mensal = (Date.parse(f.fim) - Date.parse(f.inicio)) / 86400000 > 62;
  const chave = (d: string) => (mensal ? d.slice(0, 7) : d);
  const serie = new Map<string, { periodo: string; investimento: number; leads: number; pedidos: number }>();
  const ponto = (k: string) => serie.get(k) ?? serie.set(k, { periodo: k, investimento: 0, leads: 0, pedidos: 0 }).get(k)!;
  for (let d = f.inicio; d <= f.fim; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) ponto(chave(d));
  if (investimentoAplicavel) for (const m of comInvest) ponto(chave(m.data_inicio)).investimento = arred(ponto(chave(m.data_inicio)).investimento + (m.investimento ?? 0));
  for (const l of leads) ponto(chave(diaLocal(l.entrada_em))).leads++;
  for (const l of clientes) ponto(chave(diaLocal(l.conversao_em!))).pedidos++;

  const nomes = new Set<string>();
  dentro.forEach(m => m.campanha && nomes.add(m.campanha.trim()));
  leads.forEach(l => l.campanha_origem.trim() && nomes.add(l.campanha_origem.trim()));
  const porCampanha = [...nomes].sort().map(nome => {
    const k = nome.toLowerCase();
    const ls = leads.filter(l => l.campanha_origem.trim().toLowerCase() === k);
    const ms = dentro.filter(m => m.campanha.trim().toLowerCase() === k && m.investimento !== null);
    const inv = investimentoAplicavel && ms.length ? arred(ms.reduce((s, m) => s + (m.investimento ?? 0), 0)) : null;
    const q = ls.filter(l => l.qualificacao === 'qualificado').length;
    const c = clientes.filter(l => l.campanha_origem.trim().toLowerCase() === k).length;
    return { campanha: nome, investimento: inv, leads: ls.length, qualificados: q, clientes: c, cpl: razao(inv, ls.length), cacMidia: razao(inv, c) };
  });

  return {
    filtro: f,
    indicadores: {
      investimento, leadsGerados: gerados, qualificados, novosClientes, receita,
      cpl: razao(investimento, gerados),
      taxaQualificacao: gerados ? (qualificados / gerados) * 100 : null,
      cpql: razao(investimento, qualificados),
      taxaConversao: gerados ? (novosClientes / gerados) * 100 : null,
      cacMidia: razao(investimento, novosClientes),
    },
    leadsPorPerfil: Object.entries(porPerfil).map(([perfil, total]) => ({ perfil, total })).sort((a, b) => b.total - a.total),
    serie: [...serie.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)),
    granularidade: mensal ? 'mes' as const : 'dia' as const,
    porCampanha,
    avisos: {
      leadsMeta, // informativo; nunca somado aos leads do CRM
      metaParciais: parciais,
      investimentoAplicavel,
      semMeta: dentro.length === 0,
      leadsMetaSemCampanha: leads.filter(l => l.origem === 'meta_ads' && !l.campanha_origem.trim()).length,
      clientesSemCampanha: clientes.filter(l => !l.campanha_origem.trim()).length,
    },
  };
}
export type Dashboard = ReturnType<typeof calcularDashboard>;
