import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { calcularPedido, CATALOGO, MODELOS, modeloSchema, pedidoSchema, produtoSchema, validarSalvar, type PedidoSalvo, type Recebimento } from '@/lib/mimo-pedido';
import { brindeSchema, caixaTipoSchema, CAIXAS_PADRAO, erroCatalogo, erroSalvar, podeConfirmarRecebimento } from '@/lib/mimo-tira-regras';
import type { Json } from '@/integrations/supabase/types';

export const carregarTiraMimo=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const acesso=await exigirMimo(context.supabase,context.userId);
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  const config=await db.from('mimo_tira_config').select('*').eq('empresa_id',acesso.empresaId).maybeSingle();
  const ausente=config.error?.code==='PGRST205'||config.error?.code==='42P01';
  if(config.error&&!ausente)throw new Error('Não foi possível carregar as configurações comerciais.');
  const {data:leads,error:erroLeads}=await context.supabase.from('mimo_leads').select('id,nome_empresa,nome_contato,telefone,responsavel_id').eq('empresa_id',acesso.empresaId).order('nome_empresa').limit(1000);
  if(erroLeads)throw new Error('Não foi possível carregar os clientes autorizados.');
  const pedidos:PedidoSalvo[]=[];
  return {...acesso,disponivel:false,estruturasDisponiveis:!ausente,leads:leads??[],pedidos,catalogo:config.data?z.array(produtoSchema).parse(config.data.catalogo):CATALOGO,modelos:config.data?z.array(modeloSchema).parse(config.data.modelos):MODELOS,taxas:config.data?z.array(z.number().int().min(0).max(9999)).length(12).parse(config.data.taxas):Array.from({length:12},(_,i)=>i===0?313:i<6?368:589),brindes:config.data?z.array(brindeSchema).parse(config.data.brindes):[],caixas:config.data?z.array(caixaTipoSchema).parse(config.data.caixas):CAIXAS_PADRAO,configVersao:config.data?.updated_at??null};
});
export const salvarPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(0),pedido:pedidoSchema}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const acesso=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  let pix:Recebimento=null;if(data.versao){const atual=await db.from('mimo_tira_pedidos').select('pix,status').eq('id',data.id).eq('empresa_id',acesso.empresaId).single();if(atual.error)throw new Error('Pedido indisponível.');pix=atual.data.pix as Recebimento;const erro=erroSalvar(acesso.papel,atual.data.status as PedidoSalvo['status'],data.pedido);if(erro)throw new Error(erro);}
  const regra=erroSalvar(acesso.papel,null,data.pedido);if(regra)throw new Error(regra);validarSalvar(data.pedido,pix);
  const {data:lead,error:erroLead}=await context.supabase.from('mimo_leads').select('id,nome_empresa,responsavel_id').eq('id',data.pedido.leadId??'').eq('empresa_id',acesso.empresaId).single();if(erroLead||!lead)throw new Error('Cliente indisponível.');
  const documento={...data.pedido,cliente:lead.nome_empresa,responsavelId:lead.responsavel_id};
  const t=calcularPedido(documento);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_salvar',{_empresa:acesso.empresaId,_ator:context.userId,_id:data.id,_versao:data.versao,_documento:documento as unknown as Json,_total:t.total,_produtos:t.produtos,_frete:t.frete});if(r.error)throw new Error(r.error.code==='40001'?'O pedido mudou. Reabra antes de salvar.':'Não foi possível salvar o pedido. Confira as pendências e seu acesso.');return {id:r.data.id};
});
export const configurarTiraMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({versao:z.string().nullable(),catalogo:z.array(produtoSchema).min(1).max(200),modelos:z.array(modeloSchema).max(50),taxas:z.array(z.number().int().min(0).max(9999)).length(12),brindes:z.array(brindeSchema).max(200),caixas:z.array(caixaTipoSchema).min(1).max(20)}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);if(a.papel==='vendedor')throw new Error('Só administrador ou gestor altera configurações.');if(new Set(data.catalogo.map(p=>p.codigo)).size!==data.catalogo.length)throw new Error('Código de produto repetido.');
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_configurar',{_empresa:a.empresaId,_ator:context.userId,_versao:data.versao,_catalogo:data.catalogo as unknown as Json,_modelos:data.modelos as unknown as Json,_taxas:data.taxas,_brindes:data.brindes as unknown as Json,_caixas:data.caixas as unknown as Json});if(r.error)throw new Error('Não foi possível salvar. Reabra as configurações antes de tentar novamente.');return {salvo:true};
});
export const receberPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(1),operacao:z.string().uuid(),valor:z.number().int().positive().max(100_000_000)}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');
  const {data:pedido,error}=await tiraClient(context.supabase).from('mimo_tira_pedidos').select('id,lead_id,versao,status').eq('empresa_id',a.empresaId).eq('id',data.id).single();
  if(error||!pedido||!podeConfirmarRecebimento(a.papel,pedido.status as PedidoSalvo['status'])||pedido.versao!==data.versao)throw new Error('Pedido indisponível ou alterado. Reabra antes de confirmar.');
  const {data:lead,error:erroLead}=await context.supabase.from('mimo_leads').select('id').eq('empresa_id',a.empresaId).eq('id',pedido.lead_id).single();
  if(erroLead||!lead)throw new Error('Acesso negado.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_receber',{_empresa:a.empresaId,_ator:context.userId,_id:data.id,_versao:data.versao,_operacao:data.operacao,_valor:data.valor});if(r.error)throw new Error('Não foi possível confirmar. Reabra o pedido e confira o valor.');return {salvo:true};
});
export const historicoPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const r=await tiraClient(context.supabase).from('mimo_tira_versoes').select('*').eq('empresa_id',a.empresaId).eq('pedido_id',data.id).order('versao',{ascending:false});if(r.error)throw new Error('Não foi possível carregar o histórico.');return (r.data??[]).map(v=>({...v,documento:pedidoSchema.parse(v.documento)}));
});