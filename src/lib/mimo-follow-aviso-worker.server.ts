import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/integrations/supabase/types';
import {hashTokenMimo,numeroConectadoMimo} from './mimo-whatsapp';
import {exibirComercial} from './mimo-comercial';
import {uazStatus,uazSendText} from './uazapi.server';
import {processarAvisoInterno} from './mimo-follow-aviso-processador';
type Fila={id:string;empresa_id:string;follow_id:string;follow_versao:number;destinatario_id:string;numero:string;vinculo_id:string;reserva:string};
type WorkerDb=Omit<Database,'public'>&{public:Omit<Database['public'],'Functions'>&{Functions:Database['public']['Functions']&{
 mimo_follow_aviso_reservar:{Args:Record<string,never>;Returns:Fila|null};
 mimo_follow_aviso_autorizar:{Args:{_id:string;_reserva:string};Returns:boolean};
 mimo_follow_aviso_finalizar:{Args:{_id:string;_reserva:string;_aceita:boolean;_message_id:string|null};Returns:boolean};
}}};
const workerDb=(db:SupabaseClient<Database>)=>db as unknown as SupabaseClient<WorkerDb>;
async function tokenConfirmado(db:SupabaseClient<Database>,q:Fila){
 const r=await db.from('mimo_whatsapp_vinculos').select('*').eq('empresa_id',q.empresa_id).eq('id',q.vinculo_id).eq('ativo',true).maybeSingle();
 const v=r.data;if(r.error||!v)return null;
 const [p,i]=await Promise.all([
  db.from('profiles').select('id,uazapi_instance_token').eq('id',v.owner_id).maybeSingle(),
  v.instancia_id?db.from('uazapi_instancias').select('id,user_id,token').eq('id',v.instancia_id).eq('user_id',v.owner_id).maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 const token=v.instancia_id?i.data?.token:p.data?.uazapi_instance_token;
 if(p.error||i.error||!token||await hashTokenMimo(token)!==v.token_sha256)return null;
 const [profiles,instancias]=await Promise.all([
  db.from('profiles').select('id').eq('uazapi_instance_token',token),
  db.from('uazapi_instancias').select('id,user_id').eq('token',token),
 ]);
 if(profiles.error||instancias.error)return null;
 if(v.instancia_id){if(profiles.data?.length||instancias.data?.length!==1||instancias.data[0].id!==v.instancia_id||instancias.data[0].user_id!==v.owner_id)return null;}
 else if(profiles.data?.length!==1||profiles.data[0].id!==v.owner_id||instancias.data?.length)return null;
 const live=await uazStatus(token,AbortSignal.timeout(7000));
 const numero=numeroConectadoMimo(live.profileNumber);
 if(live.status!=='connected'||!numero||numero!==numeroConectadoMimo(v.numero_comercial)||numero===q.numero)return null;
 return token;
}
export async function executarAvisosFollowupMimo(){
 if(process.env.MIMO_FOLLOW_AVISOS_WORKER!=='ativo')return 'pausado';
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const client=workerDb(db);const r=await client.rpc('mimo_follow_aviso_reservar',{});
 if(r.error)throw Error('aviso_reserva_indisponivel');const q=r.data;if(!q?.id)return 'sem_pendencias';
 return processarAvisoInterno({
  preparar:async()=>{
   const token=await tokenConfirmado(db,q);if(!token)return null;
   const {comercialClient}=await import('./mimo-comercial-db');
   const f=await comercialClient(db).from('mimo_lead_followups').select('lead_id,prazo').eq('empresa_id',q.empresa_id).eq('id',q.follow_id).maybeSingle();
   if(f.error||!f.data)return null;
   const lead=await db.from('mimo_leads').select('nome_empresa').eq('empresa_id',q.empresa_id).eq('id',f.data.lead_id).maybeSingle();
   if(lead.error||!lead.data)return null;
   const nome=lead.data.nome_empresa.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,80);
   return {token,numero:q.numero,texto:`MiMo · follow-up pendente\nCliente: ${nome}\nPrazo: ${exibirComercial(f.data.prazo)} (São Paulo)\nConsulte o lead e registre o acompanhamento no painel: https://zapscout.com.br/mimo/leads`};
  },
  autorizar:async()=>{const a=await client.rpc('mimo_follow_aviso_autorizar',{_id:q.id,_reserva:q.reserva});if(a.error)throw Error('aviso_autorizacao_indisponivel');return a.data===true;},
  enviar:uazSendText,
  finalizar:async(aceita,id)=>{const f=await client.rpc('mimo_follow_aviso_finalizar',{_id:q.id,_reserva:q.reserva,_aceita:aceita,_message_id:id});if(f.error||f.data!==true)throw Error('aviso_registro_indisponivel');},
 });
}
