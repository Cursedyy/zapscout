import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { CATALOGO, MODELOS, modeloSchema, pedidoSchema, produtoSchema, validarSalvar, type PedidoSalvo, type Recebimento } from '@/lib/mimo-pedido';
import type { Json } from '@/integrations/supabase/types';

export const carregarTiraMimo=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const acesso=await exigirMimo(context.supabase,context.userId);
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  const config=await db.from('mimo_tira_config').select('*').eq('empresa_id',acesso.empresaId).maybeSingle();
  const ausente=config.error?.code==='PGRST205'||config.error?.code==='42P01';
  if(config.error&&!ausente)throw new Error('Não foi possível carregar as configurações comerciais.');
  const {data:leads,error:erroLeads}=await context.supabase.from('mimo_leads').select('id,nome_empresa,nome_contato,telefone,responsavel_id').eq('empresa_id',acesso.empresaId).order('nome_empresa').limit(1000);
  if(erroLeads)throw new Error('Não foi possível carregar os clientes autorizados.');
  let pedidos:PedidoSalvo[]=[];
  if(!ausente){const r=await db.from('mimo_tira_pedidos').select('*').eq('empresa_id',acesso.empresaId).order('updated_at',{ascending:false}).limit(1000);if(r.error)throw new Error('Não foi possível carregar os pedidos.');pedidos=(r.data??[]).map(p=>({...p,status:pedidoSchema.parse(p.documento).status,documento:pedidoSchema.parse(p.documento),pix:p.pix as Recebimento,recebimentos:p.recebimentos as Recebimento[]}));}
  return {...acesso,disponivel:!ausente,leads:leads??[],pedidos,catalogo:config.data?z.array(produtoSchema).parse(config.data.catalogo):CATALOGO,modelos:config.data?z.array(modeloSchema).parse(config.data.modelos):MODELOS,taxas:config.data?z.array(z.number().int().min(0).max(9999)).length(12).parse(config.data.taxas):Array.from({length:12},(_,i)=>i===0?313:i<6?368:589),configVersao:config.data?.updated_at??null};
});
export const salvarPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(0),pedido:pedidoSchema}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const acesso=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  let pix:Recebimento=null;if(data.versao){const atual=await db.from('mimo_tira_pedidos').select('pix').eq('id',data.id).eq('empresa_id',acesso.empresaId).single();if(atual.error)throw new Error('Pedido indisponível.');pix=atual.data.pix as Recebimento;}
  validarSalvar(data.pedido,pix);
  const {data:lead,error:erroLead}=await context.supabase.from('mimo_leads').select('id,nome_empresa,responsavel_id').eq('id',data.pedido.leadId??'').eq('empresa_id',acesso.empresaId).single();if(erroLead||!lead)throw new Error('Cliente indisponível.');
  const documento={...data.pedido,cliente:lead.nome_empresa,responsavelId:lead.responsavel_id};
  const r=await db.rpc('mimo_tira_salvar',{_empresa:acesso.empresaId,_id:data.id,_versao:data.versao,_documento:documento as unknown as Json});if(r.error)throw new Error(r.error.code==='40001'?'O pedido mudou. Reabra antes de salvar.':'Não foi possível salvar o pedido. Confira as pendências e seu acesso.');return {id:r.data.id};
});
export const configurarTiraMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({versao:z.string().nullable(),catalogo:z.array(produtoSchema).min(1).max(200),modelos:z.array(modeloSchema).max(50),taxas:z.array(z.number().int().min(0).max(9999)).length(12)}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);if(a.papel==='vendedor')throw new Error('Só administrador ou gestor altera configurações.');if(new Set(data.catalogo.map(p=>p.codigo)).size!==data.catalogo.length)throw new Error('Código de produto repetido.');
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const r=await tiraClient(context.supabase).rpc('mimo_tira_configurar',{_empresa:a.empresaId,_versao:data.versao,_catalogo:data.catalogo as unknown as Json,_modelos:data.modelos as unknown as Json,_taxas:data.taxas});if(r.error)throw new Error('Não foi possível salvar. Reabra as configurações antes de tentar novamente.');return {salvo:true};
});
export const receberPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(1),operacao:z.string().uuid(),valor:z.number().int().positive().max(100_000_000)}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const r=await tiraClient(context.supabase).rpc('mimo_tira_receber',{_empresa:a.empresaId,_id:data.id,_versao:data.versao,_operacao:data.operacao,_valor:data.valor});if(r.error)throw new Error('Não foi possível confirmar. Reabra o pedido e confira o valor.');return {salvo:true};
});
export const historicoPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const r=await tiraClient(context.supabase).from('mimo_tira_versoes').select('*').eq('empresa_id',a.empresaId).eq('pedido_id',data.id).order('versao',{ascending:false});if(r.error)throw new Error('Não foi possível carregar o histórico.');return (r.data??[]).map(v=>({...v,documento:pedidoSchema.parse(v.documento)}));
});