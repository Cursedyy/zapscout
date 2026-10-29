import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { limitesPeriodo } from '@/lib/mimo-dashboard';
import { filtroRelatorioSchema, periodoAnterior, calcularRelatorio, type LeadRel, type MetricaRel } from '@/lib/mimo-relatorio';

const MAX = 20000;
const n = (v: number | null) => (v === null ? null : Number(v));

// Only admin/gestor of the fixed MiMo company; vendedores never receive company-wide rows.
export const relatorioMimo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(v => filtroRelatorioSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { exigirMimo } = await import('@/lib/mimo-leads.server');
    const acesso = await exigirMimo(context.supabase, context.userId);
    if (acesso.papel !== 'administrador' && acesso.papel !== 'gestor') return { permitido: false as const };
    const ant = periodoAnterior(data);
    const de = limitesPeriodo(ant).de, ate = limitesPeriodo(data).ate;
    const leads: LeadRel[] = [];
    for (let off = 0; off < MAX; off += 1000) {
      const { data: rows, error } = await context.supabase.from('mimo_leads')
        .select('nome_empresa,nome_contato,anuncio_origem,entrada_em,perfil,origem,campanha_origem,qualificacao,etapa,conversao_em,valor_pedido')
        .eq('empresa_id', acesso.empresaId).gte('entrada_em', de).lte('entrada_em', ate).order('entrada_em').order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar os leads.');
      leads.push(...rows.map(r => ({ ...r, valor_pedido: n(r.valor_pedido) })));
      if (rows.length < 1000) break;
    }
    const metricas: MetricaRel[] = [];
    for (let off = 0; off < MAX; off += 1000) {
      const { data: rows, error } = await context.supabase.from('mimo_meta_ads_metricas')
        .select('data_inicio,data_fim,campanha,conjunto,anuncio,investimento,leads_meta,impressoes,alcance,cliques')
        .eq('empresa_id', acesso.empresaId).lte('data_inicio', data.fim).gte('data_fim', ant.inicio).order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar o Meta Ads.');
      metricas.push(...rows.map(r => ({ ...r, investimento: n(r.investimento), leads_meta: n(r.leads_meta), impressoes: n(r.impressoes), alcance: n(r.alcance), cliques: n(r.cliques) })));
      if (rows.length < 1000) break;
    }
    return { permitido: true as const, ...calcularRelatorio(data, leads, metricas) };
  });
