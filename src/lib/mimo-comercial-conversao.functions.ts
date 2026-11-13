import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {filtroDashboardSchema,filtrarLeadsPeriodo} from './mimo-dashboard';
import {isoComercial} from './mimo-comercial';
import {conversaoCanonica} from './mimo-comercial-v2';
import {lerPaginasComerciais} from './mimo-comercial-paginacao';
export const conversaoPedidosMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>filtroDashboardSchema.parse(v)).handler(async({context,data})=>{
 const {exigirMimo}=await import('./mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);
 if(!['administrador','gestor','vendedor'].includes(a.papel))return {disponivel:false as const,motivo:'A conversão de pedidos não está disponível para este cargo.'};
 const {capacidadeComercial}=await import('./mimo-comercial-v2.server');
 if(!await capacidadeComercial(context.supabase,a.empresaId))return {disponivel:false as const,motivo:'Conversão de pedidos não apurada: segunda fatia ainda não ativada.'};
 const de=isoComercial(`${data.inicio}T00:00`),ate=new Date(Date.parse(isoComercial(`${data.fim}T23:59`))+59999).toISOString();
 const {comercialV2}=await import('./mimo-comercial-v2-db');
 const [leads,pedidos]=await Promise.all([
  lerPaginasComerciais((inicio,fim)=>context.supabase.from('mimo_leads').select('id,entrada_em,origem,campanha_origem',{count:'exact'}).eq('empresa_id',a.empresaId).gte('entrada_em',de).lte('entrada_em',ate).order('id').range(inicio,fim)),
  lerPaginasComerciais((inicio,fim)=>comercialV2(context.supabase).from('mimo_pedidos_conversao').select('lead_id,status,total,primeira_confirmacao',{count:'exact'}).eq('empresa_id',a.empresaId).gte('primeira_confirmacao',de).lte('primeira_confirmacao',ate).order('id').range(inicio,fim)),
 ]);
 return {disponivel:true as const,...conversaoCanonica(filtrarLeadsPeriodo(data,leads),pedidos,de,ate)};
});
