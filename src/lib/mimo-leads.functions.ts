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
export type LeadEmEsperaMimo = {id:string; empresa_id:string; nome_empresa:string; nome_contato:string; telefone:string; perfil:string; origem:string; entrada_em:string};
const papeisAtendimento = ['administrador','gestor','vendedor'];
// Fila compartilhada: o lead fica aqui desde a entrada até o primeiro vendedor assumir.
export const leadsEmEsperaMimo = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase,context.userId);
  if (!papeisAtendimento.includes(acesso.papel)) return {leads:[] as LeadEmEsperaMimo[]};
  const {data,error} = await context.supabase.rpc('mimo_leads_em_espera',{_limite:20});
  // Antes da migração da fila, o painel segue funcionando com a lista vazia.
  if (error) {
    if (['42883','PGRST202'].includes(error.code)) return {leads:[] as LeadEmEsperaMimo[]};
    throw new Error('Não foi possível carregar os leads em espera.');
  }
  return {leads:(data ?? []) as LeadEmEsperaMimo[]};
});
export type LeadPendenteMimo = {id:string; nome_empresa:string|null; nome_contato:string|null; telefone:string|null; entrada_em:string};
// Pendências do próprio vendedor: já têm responsável, mas seguem sem qualificação.
export const meusLeadsPendentesMimo = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase,context.userId);
  const {data,error} = await context.supabase.from('mimo_leads').select('id,nome_empresa,nome_contato,telefone,entrada_em')
    .eq('empresa_id',acesso.empresaId).eq('responsavel_id',acesso.usuarioId)
    .eq('qualificacao','pendente').neq('etapa','perdido')
    .order('entrada_em',{ascending:true}).limit(10);
  if (error) return {leads:[] as LeadPendenteMimo[]};
  return {leads:(data ?? []) as LeadPendenteMimo[]};
});
export const qualificarLeadMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),qualificacao:z.enum(['qualificado','nao_qualificado'])}).parse(v)).handler(async ({data,context}) => {
  const { atualizarQualificacaoLead } = await import('@/lib/mimo-leads.server');
  return atualizarQualificacaoLead(context.supabase,context.userId,data);
});
export const assumirLeadEmEsperaMimo = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).parse(v)).handler(async ({data,context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase,context.userId);
  if (!papeisAtendimento.includes(acesso.papel)) throw new Error('Sem permissão para atender leads.');
  const {data:assumiu,error} = await context.supabase.rpc('mimo_assumir_lead',{_lead:data.id});
  if (error) throw new Error('Não foi possível assumir este lead.');
  if (assumiu !== true) throw new Error('Este lead já está em atendimento.');
  return {ok:true};
});
export const contextoLeadsMimo = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context}) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase,context.userId);
  const {data,error} = await context.supabase.from('empresa_membros').select('user_id,papel').eq('empresa_id',acesso.empresaId).eq('ativo',true).order('created_at');
  if(error) throw new Error('Não foi possível carregar os responsáveis.');
  // Profiles remain personal: only the caller's own display name is read.
  const {data:perfil} = await context.supabase.from('profiles').select('nome').eq('id',context.userId).maybeSingle();
  const {comercialV2}=await import('./mimo-comercial-v2-db');
  const equipe=['administrador','gestor','vendedor'].includes(acesso.papel)?await comercialV2(context.supabase).rpc('mimo_comercial_responsaveis',{_empresa:acesso.empresaId}):null;
  if(equipe?.error&&!['42883','PGRST202'].includes(equipe.error.code))throw Error('Não foi possível carregar os responsáveis comerciais.');
  const nomes=new Map((equipe?.data??[]).map(m=>[m.user_id,m.nome]));
  return {...acesso,membros:(data??[]).map((m,i)=>({...m,nome:nomes.get(m.user_id)??(m.user_id===context.userId?(perfil?.nome || 'Você'):`Membro ${i+1} · ${m.papel}`)}))};
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
// Commercial loss rows follow the shared company RLS; personal dashboard remains explicit.
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
