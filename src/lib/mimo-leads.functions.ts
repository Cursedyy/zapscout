import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { leadMimoSchema } from '@/lib/mimo-leads';

const filtrosSchema = z.object({ busca: z.string().max(200).default(''), inicio: z.string().datetime().nullable(), fim: z.string().datetime().nullable(), origem: z.string().max(30), perfil: z.string().max(30), etapa: z.string().max(30), responsavel: z.union([z.string().uuid(),z.literal(''),z.literal('sem')]), pagina: z.number().int().min(0).max(100000) });
export type FiltrosMimo = z.infer<typeof filtrosSchema>;
export const listarLeadsMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v => filtrosSchema.parse(v)).handler(async ({data,context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase,context.userId);
  let q = context.supabase.from('mimo_leads').select('*',{count:'exact'}).eq('empresa_id',acesso.empresaId);
  const busca = data.busca.trim().replace(/[%_(),.\\]/g,' ').trim();
  if (busca) {
    const telefone = busca.replace(/\D/g,'');
    const termos = [`nome_empresa.ilike.%${busca}%`,`nome_contato.ilike.%${busca}%`];
    if (telefone) termos.push(`telefone_normalizado.ilike.%${telefone}%`);
    q=q.or(termos.join(','));
  }
  if (data.inicio) q=q.gte('entrada_em',data.inicio);
  if (data.fim) q=q.lte('entrada_em',data.fim);
  if (data.origem) q=q.eq('origem',data.origem);
  if (data.perfil) q=q.eq('perfil',data.perfil);
  if (data.etapa) q=q.eq('etapa',data.etapa);
  if (data.responsavel==='sem') q=q.is('responsavel_id',null);
  else if (data.responsavel) q=q.eq('responsavel_id',data.responsavel);
  const {data:leads,error,count} = await q.order('entrada_em',{ascending:false}).order('id').range(data.pagina*30,data.pagina*30+29);
  if(error) throw new Error('Não foi possível carregar os leads.');
  return {leads:leads??[],total:count??0};
});
export const contextoLeadsMimo = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase,context.userId);
  const {data,error} = await context.supabase.from('empresa_membros').select('user_id,papel').eq('empresa_id',acesso.empresaId).eq('ativo',true).order('created_at');
  if(error) throw new Error('Não foi possível carregar os responsáveis.');
  // Profiles remain personal: only the caller's own display name is read.
  const {data:perfil} = await context.supabase.from('profiles').select('nome').eq('id',context.userId).maybeSingle();
  return {...acesso,membros:(data??[]).map((m,i)=>({...m,nome:m.user_id===context.userId?(perfil?.nome || 'Você'):`Membro ${i+1} · ${m.papel}`}))};
});
export const gravarLeadMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>leadMimoSchema.parse(v)).handler(async ({data,context}) => {
  const { salvarLeadMimo } = await import('@/lib/mimo-leads.server');
  return salvarLeadMimo(context.supabase,context.userId,data);
});
export const historicoLeadMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).parse(v)).handler(async ({data,context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso=await exigirMimo(context.supabase,context.userId);
  const {data:itens,error}=await context.supabase.from('mimo_lead_historico').select('*').eq('empresa_id',acesso.empresaId).eq('lead_id',data.id).order('created_at',{ascending:false});
  if(error) throw new Error('Não foi possível carregar o histórico.');
  return itens??[];
});
export const verificarDuplicadosMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({telefone:z.string().max(40),email:z.string().max(254),ignorar:z.string().uuid().nullable()}).parse(v)).handler(async ({data,context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso=await exigirMimo(context.supabase,context.userId);
  if(!data.telefone.trim()&&!data.email.trim()) return [];
  const {data:itens,error}=await context.supabase.rpc('mimo_verificar_duplicados',{_empresa:acesso.empresaId,_telefone:data.telefone,_email:data.email,...(data.ignorar?{_ignorar:data.ignorar}:{})});
  if(error) throw new Error('Não foi possível verificar duplicados.');
  return itens??[];
});
// Loss report: RLS already restricts vendedores to their own leads.
export const perdasMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({inicio:z.string().datetime().nullable(),fim:z.string().datetime().nullable()}).parse(v)).handler(async ({data,context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso=await exigirMimo(context.supabase,context.userId);
  let q=context.supabase.from('mimo_leads').select('motivo_perda_codigo,responsavel_id').eq('empresa_id',acesso.empresaId).eq('etapa','perdido');
  if(data.inicio) q=q.gte('updated_at',data.inicio);
  if(data.fim) q=q.lte('updated_at',data.fim);
  const {data:linhas,error}=await q.limit(20000);
  if(error) throw new Error('Não foi possível carregar as perdas.');
  return {papel:acesso.papel,usuarioId:acesso.usuarioId,linhas:linhas??[]};
});
