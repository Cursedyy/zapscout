import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { filtroDashboardSchema, calcularDashboard, limitesPeriodo, type LeadDash, type MetricaDash } from '@/lib/mimo-dashboard';

const MAX = 20000;

export const dashboardMimo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(v => filtroDashboardSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import('@/lib/mimo-leads.server');
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (acesso.papel !== 'administrador' && acesso.papel !== 'gestor') return { permitido: false as const };
    const { de, ate } = limitesPeriodo(data);
    const leads: LeadDash[] = [];
    for (let off = 0; off < MAX; off += 1000) {
      const { data: rows, error } = await context.supabase.from('mimo_leads')
        .select('entrada_em,perfil,origem,campanha_origem,qualificacao,etapa,conversao_em,valor_pedido')
        .eq('empresa_id', acesso.empresaId).gte('entrada_em', de).lte('entrada_em', ate).order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar os leads.');
      leads.push(...rows.map(r => ({ ...r, valor_pedido: r.valor_pedido === null ? null : Number(r.valor_pedido) })));
      if (rows.length < 1000) break;
    }
    const metricas: MetricaDash[] = [];
    for (let off = 0; off < MAX; off += 1000) {
      const { data: rows, error } = await context.supabase.from('mimo_meta_ads_metricas')
        .select('data_inicio,data_fim,campanha,investimento,leads_meta')
        .eq('empresa_id', acesso.empresaId).lte('data_inicio', data.fim).gte('data_fim', data.inicio).order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar o Meta Ads.');
      metricas.push(...rows.map(r => ({ ...r, investimento: r.investimento === null ? null : Number(r.investimento), leads_meta: r.leads_meta === null ? null : Number(r.leads_meta) })));
      if (rows.length < 1000) break;
    }
    return { permitido: true as const, ...calcularDashboard(data, leads, metricas) };
  });
