import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { calcularPedido, CATALOGO, MODELOS, modeloSchema, pedidoSchema, produtoSchema, validarSalvar, type PedidoSalvo, type Recebimento } from '@/lib/mimo-pedido';
import { brindeSchema, buscaSegura, caixaTipoSchema, CAIXAS_PADRAO, erroCatalogo, erroSalvar, erroTransicao, filtroPedidosSchema, indicadoresTira, intervalo, motivoCancelamentoSchema, ORDENS, podeConfirmarRecebimento, podeVerProposta, restaurarVersao, snapshotCliente, documentoPorPapel, brindesPorPapel, prepararDocumento } from '@/lib/mimo-tira-regras';
import type { Json } from '@/integrations/supabase/types';

export const carregarTiraMimo=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const acesso=await exigirMimo(context.supabase,context.userId);
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  const config=await db.from('mimo_tira_config_segura').select('*').eq('empresa_id',acesso.empresaId).maybeSingle();
  const ausente=config.error?.code==='PGRST205'||config.error?.code==='42P01';
  if(config.error&&!ausente)throw new Error('Não foi possível carregar as configurações comerciais.');
  const {data:leads,error:erroLeads}=await context.supabase.from('mimo_leads').select('id,nome_empresa,nome_contato,telefone,responsavel_id').eq('empresa_id',acesso.empresaId).order('nome_empresa').limit(1000);
  if(erroLeads)throw new Error('Não foi possível carregar os clientes autorizados.');
  const {tiraPersistenciaAtiva}=await import('@/lib/mimo-tira.server');const pedidos:PedidoSalvo[]=[];
  return {...acesso,disponivel:tiraPersistenciaAtiva()&&!ausente,estruturasDisponiveis:!ausente,leads:leads??[],pedidos,catalogo:config.data?z.array(produtoSchema).parse(config.data.catalogo):CATALOGO,modelos:config.data?z.array(modeloSchema).parse(config.data.modelos):MODELOS,taxas:config.data?z.array(z.number().int().min(0).max(9999)).length(12).parse(config.data.taxas):Array.from({length:12},(_,i)=>i===0?313:i<6?368:589),brindes:brindesPorPapel(config.data?z.array(brindeSchema).parse(config.data.brindes):[],acesso.papel),caixas:config.data?z.array(caixaTipoSchema).parse(config.data.caixas):CAIXAS_PADRAO,configVersao:config.data?.updated_at??null};
});
export const salvarPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(0),pedido:pedidoSchema}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const acesso=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  let pix:Recebimento=null;if(data.versao){const atual=await db.from('mimo_tira_pedidos_seguros').select('pix,status').eq('id',data.id).eq('empresa_id',acesso.empresaId).single();if(atual.error)throw new Error('Pedido indisponível.');pix=atual.data.pix as Recebimento;const erro=erroSalvar(acesso.papel,atual.data.status as PedidoSalvo['status'],data.pedido);if(erro)throw new Error(erro);}
  const regra=erroSalvar(acesso.papel,null,data.pedido);if(regra)throw new Error(regra);validarSalvar(data.pedido,pix);
  const {data:lead,error:erroLead}=await context.supabase.from('mimo_leads').select('id,nome_empresa,responsavel_id').eq('id',data.pedido.leadId??'').eq('empresa_id',acesso.empresaId).single();if(erroLead||!lead)throw new Error('Cliente indisponível.');
  const {supabaseAdmin:adminFinanceiro}=await import('@/integrations/supabase/client.server');
  const priv=tiraClient(adminFinanceiro);const [cfg,old]=await Promise.all([priv.from('mimo_tira_config').select('*').eq('empresa_id',acesso.empresaId).maybeSingle(),data.versao?priv.from('mimo_tira_pedidos').select('documento').eq('empresa_id',acesso.empresaId).eq('id',data.id).single():Promise.resolve({data:null,error:null})]);
  if(cfg.error||old.error)throw new Error('Não foi possível validar as condições comerciais.');
  const canonical=prepararDocumento(data.pedido,acesso.papel,cfg.data?z.array(produtoSchema).parse(cfg.data.catalogo):CATALOGO,cfg.data?z.array(brindeSchema).parse(cfg.data.brindes):[],cfg.data?z.array(z.number().int().min(0).max(9999)).length(12).parse(cfg.data.taxas):Array.from({length:12},(_,i)=>i===0?313:i<6?368:589),old.data?pedidoSchema.parse(old.data.documento):null);
  const documento={...canonical,cliente:lead.nome_empresa,responsavelId:lead.responsavel_id};validarSalvar(documento,pix);
  const t=calcularPedido(documento);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_salvar',{_empresa:acesso.empresaId,_ator:context.userId,_id:data.id,_versao:data.versao,_documento:documento as unknown as Json,_total:t.total,_produtos:t.produtos,_frete:t.frete});if(r.error)throw new Error(r.error.code==='40001'?'O pedido mudou. Reabra antes de salvar.':'Não foi possível salvar o pedido. Confira as pendências e seu acesso.');return {id:r.data.id};
});
export const configurarTiraMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({versao:z.string().nullable(),catalogo:z.array(produtoSchema).min(1).max(200),modelos:z.array(modeloSchema).max(50),taxas:z.array(z.number().int().min(0).max(9999)).length(12),brindes:z.array(brindeSchema).max(200),caixas:z.array(caixaTipoSchema).min(1).max(20)}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);if(a.papel==='vendedor')throw new Error('Só administrador ou gestor altera configurações.');const {tiraClient}=await import('@/lib/mimo-pedido-db');const anterior=await tiraClient(context.supabase).from('mimo_tira_config').select('catalogo').eq('empresa_id',a.empresaId).maybeSingle();const errCat=erroCatalogo(anterior.data?z.array(produtoSchema).parse(anterior.data.catalogo):CATALOGO,data.catalogo);if(errCat)throw new Error(errCat);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_configurar',{_empresa:a.empresaId,_ator:context.userId,_versao:data.versao,_catalogo:data.catalogo as unknown as Json,_modelos:data.modelos as unknown as Json,_taxas:data.taxas,_brindes:data.brindes as unknown as Json,_caixas:data.caixas as unknown as Json});if(r.error)throw new Error('Não foi possível salvar. Reabra as configurações antes de tentar novamente.');return {salvo:true};
});
export const receberPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(1),operacao:z.string().uuid(),valor:z.number().int().positive().max(100_000_000)}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');
  const {data:pedido,error}=await tiraClient(context.supabase).from('mimo_tira_pedidos_seguros').select('id,lead_id,versao,status').eq('empresa_id',a.empresaId).eq('id',data.id).single();
  if(error||!pedido||!podeConfirmarRecebimento(a.papel,pedido.status as PedidoSalvo['status'])||pedido.versao!==data.versao)throw new Error('Pedido indisponível ou alterado. Reabra antes de confirmar.');
  const {data:lead,error:erroLead}=await context.supabase.from('mimo_leads').select('id').eq('empresa_id',a.empresaId).eq('id',pedido.lead_id).single();
  if(erroLead||!lead)throw new Error('Acesso negado.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_receber',{_empresa:a.empresaId,_ator:context.userId,_id:data.id,_versao:data.versao,_operacao:data.operacao,_valor:data.valor});if(r.error)throw new Error('Não foi possível confirmar. Reabra o pedido e confira o valor.');return {salvo:true};
});
export const historicoPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraPersistenciaAtiva}=await import('@/lib/mimo-tira.server');if(!tiraPersistenciaAtiva())return [];const {tiraClient}=await import('@/lib/mimo-pedido-db');const r=await tiraClient(context.supabase).from('mimo_tira_versoes_seguras').select('*').eq('empresa_id',a.empresaId).eq('pedido_id',data.id).order('versao',{ascending:false});if(r.error)throw new Error('Não foi possível carregar o histórico.');return (r.data??[]).map(v=>({...v,documento:documentoPorPapel(pedidoSchema.parse(v.documento),a.papel)}));
});const statusEnum=z.enum(['rascunho','aguardando_pagamento','confirmado','faturado','enviado','entregue','cancelado']);
const mapear=(p:{documento:Json;pix:Json;recebimentos:Json}&Record<string,unknown>)=>{const documento=pedidoSchema.parse(p.documento);return {...p,documento,status:documento.status,pix:p.pix as Recebimento,recebimentos:p.recebimentos as Recebimento[]} as unknown as PedidoSalvo;};
export const listarPedidosMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>filtroPedidosSchema.parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraPersistenciaAtiva}=await import('@/lib/mimo-tira.server');
  if(!tiraPersistenciaAtiva())return {disponivel:false,itens:[] as PedidoSalvo[],total:0,indicadores:indicadoresTira([])};
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);const {de,ate}=intervalo(data);const [col,asc]=ORDENS[data.ordem];
  let q=db.from('mimo_tira_pedidos_seguros').select('*',{count:'exact'}).eq('empresa_id',a.empresaId);
  if(data.status)q=q.eq('status',data.status);if(data.inicio)q=q.gte('created_at',`${data.inicio}T00:00:00-03:00`);if(data.fim)q=q.lte('created_at',`${data.fim}T23:59:59.999-03:00`);
  const b=buscaSegura(data.busca);if(/^\d{1,12}$/.test(b))q=q.eq('numero',Number(b));else if(b)q=q.ilike('documento->>cliente',`%${b}%`);
  const r=await q.order(col,{ascending:asc}).range(de,ate);if(r.error)throw new Error('Não foi possível carregar os pedidos.');
  const itens=(r.data??[]).map(x=>{const p=mapear(x);return {...p,documento:documentoPorPapel(p.documento,a.papel)};});return {disponivel:true,itens,total:r.count??0,indicadores:indicadoresTira(itens)};
});
export const alterarStatusPedidoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(1),status:statusEnum,motivo:z.string().max(1000).nullable(),faturadoEm:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');
  const atual=await tiraClient(context.supabase).from('mimo_tira_pedidos_seguros').select('*').eq('empresa_id',a.empresaId).eq('id',data.id).single();if(atual.error||!atual.data||atual.data.versao!==data.versao)throw new Error('Pedido indisponível ou alterado. Reabra antes de continuar.');
  const p=mapear(atual.data);const doc={...p.documento,pagamento:{...p.documento.pagamento,faturadoEm:data.status==='faturado'?(data.faturadoEm??p.documento.pagamento.faturadoEm):p.documento.pagamento.faturadoEm}};
  const erro=erroTransicao(a.papel,p.status,data.status,doc,p.pix);if(erro)throw new Error(erro);
  const motivo=data.status==='cancelado'?motivoCancelamentoSchema.parse(data.motivo??''):null;
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_status',{_empresa:a.empresaId,_ator:context.userId,_id:data.id,_versao:data.versao,_status:data.status,_motivo:motivo,_faturado:doc.pagamento.faturadoEm});
  if(r.error)throw new Error(r.error.code==='40001'?'O pedido mudou. Reabra antes de continuar.':'Mudança de estado recusada. Confira as regras e seu acesso.');return {salvo:true};
});
export const restaurarVersaoMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versaoAtual:z.number().int().min(1),versaoOrigem:z.number().int().min(1)}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');const db=tiraClient(context.supabase);
  const [atual,origem]=await Promise.all([db.from('mimo_tira_pedidos_seguros').select('*').eq('empresa_id',a.empresaId).eq('id',data.id).single(),db.from('mimo_tira_versoes_seguras').select('documento').eq('empresa_id',a.empresaId).eq('pedido_id',data.id).eq('versao',data.versaoOrigem).single()]);
  if(atual.error||origem.error||!atual.data||atual.data.versao!==data.versaoAtual)throw new Error('Versão indisponível ou pedido alterado.');
  const p=mapear(atual.data);const {supabaseAdmin:adminRestauracao}=await import('@/integrations/supabase/client.server');const original=await tiraClient(adminRestauracao).from('mimo_tira_versoes').select('documento').eq('empresa_id',a.empresaId).eq('pedido_id',data.id).eq('versao',data.versaoOrigem).single();if(original.error)throw new Error('Versão indisponível.');const {documento,refazerFrete}=restaurarVersao(p.status,pedidoSchema.parse(original.data.documento));
  const {data:lead}=await context.supabase.from('mimo_leads').select('nome_empresa,responsavel_id').eq('empresa_id',a.empresaId).eq('id',p.lead_id).single();if(!lead)throw new Error('Acesso negado.');
  const doc={...documento,leadId:p.lead_id,cliente:lead.nome_empresa,responsavelId:lead.responsavel_id};validarSalvar(doc,p.pix);const t=calcularPedido(doc);
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_salvar',{_empresa:a.empresaId,_ator:context.userId,_id:data.id,_versao:data.versaoAtual,_documento:doc as unknown as Json,_total:t.total,_produtos:t.produtos,_frete:t.frete});
  if(r.error)throw new Error('Não foi possível restaurar. Reabra o pedido.');return {refazerFrete};
});
export const emitirPropostaMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid(),versao:z.number().int().min(1)}).parse(v)).handler(async({data,context})=>{
  const {exigirAtivacaoTira}=await import('@/lib/mimo-tira.server');exigirAtivacaoTira();const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraClient}=await import('@/lib/mimo-pedido-db');
  const atual=await tiraClient(context.supabase).from('mimo_tira_pedidos_seguros').select('*').eq('empresa_id',a.empresaId).eq('id',data.id).single();if(atual.error||!atual.data||atual.data.versao!==data.versao)throw new Error('Salve e reabra o pedido antes de emitir.');
  const p=mapear(atual.data);if(!podeVerProposta(a.papel,context.userId,p.documento.responsavelId))throw new Error('Acesso negado.');const snap=snapshotCliente(p.documento);
  const bytes=new TextEncoder().encode(JSON.stringify(snap));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const arquivo=`${a.empresaId}/${data.id}/v${data.versao}-${hash.slice(0,16)}.pdf`;const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const r=await tiraClient(supabaseAdmin).rpc('mimo_tira_proposta',{_empresa:a.empresaId,_ator:context.userId,_id:crypto.randomUUID(),_versao:data.versao,_pedido:data.id,_arquivo:arquivo,_hash:hash,_documento:snap as unknown as Json});
  if(r.error)throw new Error('Não foi possível registrar a proposta.');return {numero:r.data.numero,documento:snap,numeroPedido:p.numero};
});
export const listarPropostasMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>z.object({id:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
  const {exigirMimo}=await import('@/lib/mimo-leads.server');const a=await exigirMimo(context.supabase,context.userId);const {tiraPersistenciaAtiva}=await import('@/lib/mimo-tira.server');if(!tiraPersistenciaAtiva())return [];
  const {tiraClient}=await import('@/lib/mimo-pedido-db');const r=await tiraClient(context.supabase).from('mimo_tira_propostas').select('id,numero,versao,created_at,autor_id,documento').eq('empresa_id',a.empresaId).eq('pedido_id',data.id).order('created_at',{ascending:false}).limit(100);
  if(r.error)throw new Error('Não foi possível carregar as propostas.');return (r.data??[]).map(x=>({...x,documento:pedidoSchema.parse(x.documento)}));
});
