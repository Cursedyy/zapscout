import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { filtroDashboardSchema, calcularDashboard, limitesPeriodo, type LeadDash, type MetricaDash } from '@/lib/mimo-dashboard';

import { ErroConsultaComercial } from './mimo-comercial-paginacao';

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
        .select('entrada_em,perfil,origem,campanha_origem,qualificacao,etapa,conversao_em,valor_pedido,saida:mimo_whatsapp_eventos(contato_em),contato:mimo_lead_historico(created_at),qualificado:mimo_lead_historico(created_at)')
        .eq('empresa_id', acesso.empresaId).gte('entrada_em', de).lte('entrada_em', ate)
        .eq('saida.empresa_id', acesso.empresaId).eq('saida.direcao', 'enviada')
        .order('contato_em', { referencedTable: 'saida' }).limit(1, { referencedTable: 'saida' })
        .eq('contato.empresa_id', acesso.empresaId).in('contato.atual->>etapa', ['contato_realizado', 'em_negociacao', 'pedido_fechado'])
        .order('created_at', { referencedTable: 'contato' }).limit(1, { referencedTable: 'contato' })
        .eq('qualificado.empresa_id', acesso.empresaId).eq('qualificado.atual->>qualificacao', 'qualificado')
        .order('created_at', { referencedTable: 'qualificado' }).limit(1, { referencedTable: 'qualificado' });
      if (pessoal) consulta = consulta.eq('responsavel_id', context.userId);
      const { data: rows, error } = await consulta.order('id').range(off, off + 999);
      if (error) throw new Error('Não foi possível carregar os leads.');
      for (const { saida, contato, qualificado, ...lead } of rows) {
        const datasContato = [saida[0]?.contato_em, contato[0]?.created_at].filter((d): d is string => !!d);
        leads.push({ ...lead, valor_pedido: lead.valor_pedido === null ? null : Number(lead.valor_pedido),
          atendimento_em: datasContato.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null,
          qualificacao_em: qualificado[0]?.created_at ?? null });
      }
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
    let retorno = null;
    let avisoRetorno: string | null = null;
    if (!pessoal) {
      try {
        const { carregarRetornoCampanhas } = await import('./mimo-dashboard-retorno.server');
        retorno = await carregarRetornoCampanhas(context.supabase, db, acesso, data, de, ate);
      } catch (erro) {
        avisoRetorno = erro instanceof ErroConsultaComercial
          ? erro.message
          : 'Não foi possível carregar o retorno por campanha. Tente novamente.';
      }
    }
    return { permitido: true as const, escopo: pessoal ? 'pessoal' as const : 'empresa' as const, ...calcularDashboard(data, leads, metricas), retorno, avisoRetorno };
  });
