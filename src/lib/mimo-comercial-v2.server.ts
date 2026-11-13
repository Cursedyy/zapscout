import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from '@/integrations/supabase/types';
import {comercialV2} from './mimo-comercial-v2-db';
import {exigirMimo} from './mimo-leads.server';
import {acessoConexaoMimo,desafioNumeroMimo,verificarDesafioNumeroMimo,numeroConectado,qrSeguroMimo} from './mimo-whatsapp-conexao.server';
import {hashTokenMimo} from './mimo-whatsapp';
import {uazStatus,uazConnect,uazInitInstance,uazUpdateWebhook} from './uazapi.server';
import {publicWebhookUrl} from './whatsapp.functions';
import {schemaAusente} from './mimo-comercial';
import {COMERCIAL_PENDENTE,identidadeAuxiliar,type AuxiliarInput,type ConfirmarAuxiliar} from './mimo-comercial-v2';
type Context={supabase:SupabaseClient<Database>;userId:string};
export async function capacidadeComercial(db:SupabaseClient<Database>,empresa:string){
 const r=await comercialV2(db).rpc('mimo_comercial_capacidade',{_empresa:empresa});
 if(schemaAusente(r.error))return false;
 if(r.error)throw Error('Não foi possível verificar a preparação comercial. Tente novamente.');
 return r.data===2;
}
async function recursos(c:Context){
 const a=await acessoConexaoMimo(c);
 if(!await capacidadeComercial(c.supabase,a.empresaId))throw Error(COMERCIAL_PENDENTE);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');return {a,db};
}
async function selecionada(db:SupabaseClient<Database>,owner:string,id:string|null){
 if(id===null){
  const p=await db.from('profiles').select('uazapi_instance_token,wa_provider,wa_method').eq('id',owner).single();
  if(p.error||!p.data?.uazapi_instance_token||!['uazapi',null].includes(p.data.wa_provider)||!['qrcode',null].includes(p.data.wa_method))throw Error('Conexão principal indisponível.');
  const token=p.data.uazapi_instance_token;
  const [ps,is]=await Promise.all([db.from('profiles').select('id').eq('uazapi_instance_token',token),db.from('uazapi_instancias').select('id').eq('token',token)]);
  if(ps.error||is.error||ps.data?.length!==1||ps.data[0].id!==owner||is.data?.length)throw Error('Identidade principal ambígua.');
  return {token,id:null};
 }
 const r=await db.from('uazapi_instancias').select('id,user_id,token,status').eq('id',id).eq('user_id',owner).maybeSingle();
 if(r.error||!r.data?.token)throw Error('Instância auxiliar indisponível. A conexão principal não foi alterada.');
 const token=r.data.token;
 const [p,i]=await Promise.all([db.from('profiles').select('id').eq('uazapi_instance_token',token),db.from('uazapi_instancias').select('id,user_id').eq('token',token)]);
 if(p.error||i.error||!identidadeAuxiliar(p.data??[],i.data??[],owner,id))throw Error('Identidade da instância ambígua. Nenhuma conexão foi alterada.');
 return {token,id};
}
/** Purpose and instance selector are part of the signed credential context. */
export const contextoDesafioAuxiliar=(hash:string,id:string|null,finalidade:string)=>JSON.stringify({hash,id,finalidade,uso:'auxiliar-v2'});
export async function painelComercialV2(c:Context){
 const a=await acessoConexaoMimo(c);
 if(!await capacidadeComercial(c.supabase,a.empresaId))return {disponivel:false as const,motivo:COMERCIAL_PENDENTE};
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const [i,v,config,m]=await Promise.all([
 db.from('uazapi_instancias').select('id,nome,tipo,status').eq('user_id',c.userId).order('created_at'),
 comercialV2(db).from('mimo_whatsapp_vinculos').select('id,instancia_id,numero_comercial,finalidade,ativo,confirmado_em').eq('empresa_id',a.empresaId).eq('owner_id',c.userId),
 comercialV2(c.supabase).from('mimo_follow_aviso_config').select('membro_id,vinculo_id,numero,versao,confirmado_em,ativo,inicio_em').eq('empresa_id',a.empresaId),
 comercialV2(c.supabase).rpc('mimo_comercial_responsaveis',{_empresa:a.empresaId})]);
 if(i.error||v.error||config.error||m.error)throw Error('Não foi possível carregar a configuração comercial.');
 return {disponivel:true as const,instancias:i.data??[],vinculos:v.data??[],avisos:config.data??[],membros:m.data??[],workerAtivo:process.env.MIMO_FOLLOW_AVISOS_WORKER==='ativo'};
}
export async function estadoAuxiliar(c:Context,input:AuxiliarInput){
 const {a,db}=await recursos(c);const i=await selecionada(db,c.userId,input.id);
 const s=await uazStatus(i.token,AbortSignal.timeout(7000));
 const numero=s.status==='connected'?numeroConectado(s.profileNumber):null;
 const hash=await hashTokenMimo(i.token);const chave=contextoDesafioAuxiliar(hash,i.id,input.finalidade);
 return {status:s.status,numero,qrcode:s.status==='connected'?null:qrSeguroMimo(s.qrcode),desafio:numero?desafioNumeroMimo(a.empresaId,c.userId,chave,numero):null};
}
export async function parearAuxiliar(c:Context,input:AuxiliarInput){
 if(input.id===null)throw Error('Pareamento adicional não altera a conexão principal.');
 const {db}=await recursos(c);const i=await selecionada(db,c.userId,input.id);
 const s=await uazStatus(i.token,AbortSignal.timeout(7000));
 if(s.status==='connected')return {status:s.status,qrcode:null};
 if(!process.env.UAZAPI_WEBHOOK_SECRET)throw Error('Recebimento autenticado não configurado.');
 await acessoConexaoMimo(c);await selecionada(db,c.userId,input.id);
 await uazUpdateWebhook(i.token,publicWebhookUrl(),['messages'],{incluirEnviosApi:true});
 const r=await uazConnect(i.token);return {status:r.status,qrcode:qrSeguroMimo(r.qrcode)};
}
export async function criarAuxiliar(c:Context,slot:string){
 const {a,db}=await recursos(c);
 if(!process.env.UAZAPI_ADMIN_TOKEN||!process.env.UAZAPI_WEBHOOK_SECRET)throw Error('Criação comercial não configurada.');
 const r=await comercialV2(db).rpc('mimo_comercial_auxiliar_reservar',{_empresa:a.empresaId,_ator:c.userId,_slot:slot});
 if(r.error||!r.data)throw Error('Não foi possível reservar instância. Confira a configuração.');
 if(!r.data.criada)throw Error('Este espaço já existe. Se a criação foi interrompida, revise com a gestão; não será repetida automaticamente.');
 // Durable reservation is marked uncertain BEFORE provider creation; never overwrite/retry tokens.
 const i=await uazInitInstance(`mimo_${r.data.id}`);
 await acessoConexaoMimo(c);
 const salvo=await db.from('uazapi_instancias').update({token:i.token,status:'disconnected'}).eq('id',r.data.id).eq('user_id',c.userId).is('token',null).select('id').maybeSingle();
 if(salvo.error||!salvo.data)throw Error('Criação pendente de revisão. Não tente recriar automaticamente.');
 return {id:salvo.data.id};
}
export async function confirmarAuxiliar(c:Context,input:ConfirmarAuxiliar){
 const {a,db}=await recursos(c);const i=await selecionada(db,c.userId,input.id);
 const s=await uazStatus(i.token,AbortSignal.timeout(7000));const numero=numeroConectado(s.profileNumber);const hash=await hashTokenMimo(i.token);
 if(s.status!=='connected'||!numero||numero!==input.numero)throw Error('Número ao vivo mudou ou não está identificado. Confira novamente.');
 verificarDesafioNumeroMimo(input.desafio,a.empresaId,c.userId,contextoDesafioAuxiliar(hash,i.id,input.finalidade),numero);
 if(!process.env.UAZAPI_WEBHOOK_SECRET)throw Error('Recebimento autenticado não configurado.');
 await uazUpdateWebhook(i.token,publicWebhookUrl(),['messages'],{incluirEnviosApi:true});
 await acessoConexaoMimo(c);await selecionada(db,c.userId,input.id);
 const r=await comercialV2(db).rpc('mimo_comercial_vincular',{_empresa:a.empresaId,_ator:c.userId,_instancia:i.id,_hash:hash,_numero:numero,_finalidade:input.finalidade});
 if(r.error||!r.data)throw Error('Vínculo não confirmado. Atualize e confira identidade, finalidade e conflitos.');
 return {id:r.data};
}
export async function configurarAviso(c:Context,input:unknown){
 const {avisoConfigSchema}=await import('./mimo-comercial-v2');const data=avisoConfigSchema.parse(input);
 const a=await exigirMimo(c.supabase,c.userId);
 if(!['administrador','gestor'].includes(a.papel))throw Error('Somente gestão configura avisos internos.');
 if(!await capacidadeComercial(c.supabase,a.empresaId))throw Error(COMERCIAL_PENDENTE);
 const r=await comercialV2(c.supabase).rpc('mimo_follow_aviso_configurar',{_empresa:a.empresaId,_dados:data as unknown as Json});
 if(r.error||r.data===null)throw Error('Configuração não salva. Confira membro ativo, remetente confirmado e versão.');
 return {versao:r.data,ativo:false as const};
}
export async function ativarAviso(c:Context,input:unknown){
 const {avisoAtivarSchema}=await import('./mimo-comercial-v2');const data=avisoAtivarSchema.parse(input);
 const a=await exigirMimo(c.supabase,c.userId);if(!['administrador','gestor'].includes(a.papel))throw Error('Somente gestão configura avisos internos.');
 if(data.ativo&&process.env.MIMO_FOLLOW_AVISOS_WORKER!=='ativo')throw Error('Envios ainda pausados na hospedagem. Confira o teste interno e o agendamento antes de ativar.');
 if(!await capacidadeComercial(c.supabase,a.empresaId))throw Error(COMERCIAL_PENDENTE);
 const r=await comercialV2(c.supabase).rpc('mimo_follow_aviso_ativar',{_empresa:a.empresaId,_membro:data.membro,_versao:data.versao,_ativo:data.ativo});
 if(r.error||r.data===null)throw Error('Ativação não confirmada. Atualize e confira remetente, destino e versão.');return {versao:r.data};
}
