import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { followSchema } from './mimo-comercial';
export const abrirLeadComercialMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).strict().parse(v)).handler(async({context,data})=>{
  const {exigirComercial}=await import('./mimo-comercial.server');const a=await exigirComercial(context.supabase,context.userId,data.id);
  const r=await context.supabase.from('mimo_leads').select('*').eq('empresa_id',a.empresaId).eq('id',data.id).single();
  if(r.error||!r.data) throw Error('Lead indisponível para seu acesso atual.');return r.data;
});
export const contextoComercialMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).strict().parse(v)).handler(async({context,data})=>{
  const {lerContextoComercial}=await import('./mimo-comercial.server');return lerContextoComercial(context.supabase,context.userId,data.id);
});
export const followupsMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({lead:z.string().uuid().optional()}).strict().parse(v)).handler(async({context,data})=>{
  const {lerFollowups}=await import('./mimo-comercial.server');return lerFollowups(context.supabase,context.userId,data.lead);
});
export const alterarFollowupMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>followSchema.parse(v)).handler(async({context,data})=>{
  const {operarFollowup}=await import('./mimo-comercial.server');return operarFollowup(context.supabase,context.userId,data);
});