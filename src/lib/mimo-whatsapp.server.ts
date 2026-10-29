import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { hashTokenMimo,mensagemMimo } from './mimo-whatsapp';

export async function receberWhatsappMimo(db:SupabaseClient<Database>,ownerId:string,token:string,item:unknown,texto:string) {
 const hash=await hashTokenMimo(token);
 const {data:v,error} = await db.from('mimo_whatsapp_vinculos').select('id,empresa_id,instancia_id,owner_id').eq('token_sha256',hash).eq('owner_id',ownerId).eq('ativo',true).maybeSingle();
 if(error)throw new Error('mimo_vinculo_consulta');
 if(!v)return false;
 // Fail closed when the current credential is duplicated across owners or no longer belongs to the confirmed instance.
 const [{data:profiles,error:pe},{data:instancias,error:ie}] = await Promise.all([
  db.from('profiles').select('id').eq('uazapi_instance_token',token),
  db.from('uazapi_instancias').select('id,user_id').eq('token',token),
 ]);
 if(pe||ie)throw new Error('mimo_identidade_consulta');
 const proprietarios=new Set([...(profiles??[]).map(p=>p.id),...(instancias??[]).map(i=>i.user_id)]);
 if(proprietarios.size!==1||!proprietarios.has(ownerId)||(v.instancia_id!==null&&!instancias?.some(i=>i.id===v.instancia_id&&i.user_id===ownerId))||(v.instancia_id===null&&!profiles?.some(p=>p.id===ownerId))){
  await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,codigo:'identidade_divergente'});return false;
 }
 const mensagem=mensagemMimo(item,texto);
 if(!mensagem){await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,codigo:'evento_ignorado_invalido_ou_sem_id'});return false;}
 const {error:erro}=await db.rpc('mimo_receber_whatsapp',{_vinculo:v.id,_owner:ownerId,_token_sha256:hash,_message_id:mensagem.messageId,_telefone:mensagem.telefone,_nome:mensagem.nome,_texto:mensagem.texto,_contato_em:mensagem.contatoEm,_from_me:mensagem.fromMe});
 if(erro){
  const {error:logError}=await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,message_id:mensagem.messageId,codigo:'recebimento_falhou'});
  if(logError)console.error('[mimo-whatsapp] diagnostico_indisponivel');
  throw new Error('mimo_recebimento_falhou');
 }
 return true;
}