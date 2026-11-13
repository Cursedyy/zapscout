import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {filtroDashboardSchema,filtrarLeadsPeriodo} from './mimo-dashboard';
import {isoComercial} from './mimo-comercial';
import {conversaoCanonica} from './mimo-comercial-v2';
export const conversaoPedidosMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>filtroDashboardSchema.parse(v)).handler(async({context,data})=>{
 const {exigirComercial}=await import('./mimo-comercial.server');const a=await exigirComercial(context.supabase,context.userId);
 const {capacidadeComercial}=await import('./mimo-comercial-v2.server');
 if(!await capacidadeComercial(context.supabase,a.empresaId))return {disponivel:false as const,motivo:'Conversão de pedidos não apurada: segunda fatia ainda não ativada.'};
 const de=isoComercial(`${data.inicio}T00:00`),ate=new Date(Date.parse(isoComercial(`${data.fim}T23:59`))+59999).toISOString();
 const l=await context.supabase.from('mimo_leads').select('id,entrada_em,origem,campanha_origem').eq('empresa_id',a.empresaId).gte('entrada_em',de).lte('entrada_em',ate).order('id').limit(20001);
 const {comercialV2}=await import('./mimo-comercial-v2-db');
 const p=await comercialV2(context.supabase).from('mimo_pedidos_conversao').select('lead_id,status,total,primeira_confirmacao').eq('empresa_id',a.empresaId).gte('primeira_confirmacao',de).lte('primeira_confirmacao',ate).order('id').limit(20001);
 if(l.error||p.error||(l.data?.length??0)>20000||(p.data?.length??0)>20000)throw Error('Conversão não apurada. Consulta falhou ou excedeu o limite; reduza o período e tente novamente.');
 return {disponivel:true as const,...conversaoCanonica(filtrarLeadsPeriodo(data,l.data??[]),p.data??[],de,ate)};
});