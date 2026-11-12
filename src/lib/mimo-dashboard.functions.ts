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
    const { vePainelGeral } = await import('@/lib/mimo-acesso');
    const pessoal = acesso.papel === 'vendedor';
    if (!pessoal && !vePainelGeral(acesso.papel)) return { permitido: false as const };
    // Marketing não lê leads pelo próprio acesso: o servidor lê só colunas de coorte após conferir o cargo.
    const db = acesso.papel === 'marketing' ? (await import('@/integrations/supabase/client.server')).supabaseAdmin : context.supabase;
    const { de, ate } = limitesPeriodo(data);
    const [leads, metricas] = await Promise.all([
      (async()=>{
    const leads: LeadDash[] = [];
    for (let off = 0; off < MAX; off += 1000) {
      let consulta = db.from('mimo_leads')
        .select('entrada_em,perfil,origem,campanha_origem,qualificacao,etapa,conversao_em,valor_pedido')
        .eq('empresa_id', acesso.empresaId).gte('entrada_em', de).lte('entrada_em', ate);
      if (pessoal) consulta = consulta.eq('responsavel_id', context.userId);
      const { data: rows, error } = await consulta.order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar os leads.');
      leads.push(...rows.map(r => ({ ...r, valor_pedido: r.valor_pedido === null ? null : Number(r.valor_pedido) })));
      if (rows.length < 1000) break;
    }
        return leads;
      })(),
      (async()=>{
    const metricas: MetricaDash[] = [];
    if (pessoal) return metricas;
    for (let off = 0; off < MAX; off += 1000) {
      const { data: rows, error } = await context.supabase.from('mimo_meta_ads_metricas')
        .select('data_inicio,data_fim,campanha,investimento,leads_meta')
        .eq('empresa_id', acesso.empresaId).lte('data_inicio', data.fim).gte('data_fim', data.inicio).order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar o Meta Ads.');
      metricas.push(...rows.map(r => ({ ...r, investimento: r.investimento === null ? null : Number(r.investimento), leads_meta: r.leads_meta === null ? null : Number(r.leads_meta) })));
      if (rows.length < 1000) break;
    }
        return metricas;
      })(),
    ]);
    return { permitido: true as const, escopo: pessoal ? 'pessoal' as const : 'empresa' as const, ...calcularDashboard(data, leads, metricas) };
  });
