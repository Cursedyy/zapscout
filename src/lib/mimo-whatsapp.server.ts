import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { hashTokenMimo,mensagemMimo,numeroConectadoMimo,conteudoRecebidoMimo,referenciaAnuncioMimo } from './mimo-whatsapp';
import { uazStatus, type UazStatus } from './uazapi.server';
const consultasEmAndamento = new Map<string, Promise<UazStatus>>();
async function numeroAoVivo(hash: string, token: string) {
 let consulta = consultasEmAndamento.get(hash);
 if (!consulta) { consulta = uazStatus(token, AbortSignal.timeout(7000)); consultasEmAndamento.set(hash, consulta); }
 try { return await consulta; } finally { if (consultasEmAndamento.get(hash) === consulta) consultasEmAndamento.delete(hash); }
}

export async function receberWhatsappMimo(db:SupabaseClient<Database>,ownerId:string,token:string,item:unknown,texto:string) {
 const hash=await hashTokenMimo(token);
 const {data:v,error} = await db.from('mimo_whatsapp_vinculos').select('id,empresa_id,instancia_id,owner_id,numero_comercial').eq('token_sha256',hash).eq('owner_id',ownerId).eq('ativo',true).maybeSingle();
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
  await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,codigo:'identidade_divergente'});return true;
 }
 const mensagem=mensagemMimo(item,conteudoRecebidoMimo(item,texto));
 if(!mensagem){await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,codigo:'evento_ignorado_invalido_ou_sem_id'});return true;}
 let atual: UazStatus;
 try { atual=await numeroAoVivo(hash,token); } catch { throw new Error('mimo_numero_live_indisponivel'); }
 if(atual.status!=='connected'||!numeroConectadoMimo(atual.profileNumber))throw new Error('mimo_numero_live_pendente');
 if(numeroConectadoMimo(atual.profileNumber)!==numeroConectadoMimo(v.numero_comercial)){await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,codigo:'numero_comercial_divergente'});return true;}
 const args={_vinculo:v.id,_owner:ownerId,_token_sha256:hash,_message_id:mensagem.messageId,_telefone:mensagem.telefone,_nome:mensagem.nome,_texto:mensagem.texto,_contato_em:mensagem.contatoEm,_from_me:mensagem.fromMe};
 const referencia=referenciaAnuncioMimo(item);
 let resultado=referencia?await db.rpc('mimo_receber_whatsapp',{...args,...{_referencia:referencia}}):await db.rpc('mimo_receber_whatsapp',args);
 // Compatibility until the prepared SQL is applied; a missing signature executed no write.
 if(referencia&&['PGRST202','42883'].includes(resultado.error?.code??''))resultado=await db.rpc('mimo_receber_whatsapp',args);
 const erro=resultado.error;
 if(erro){
  const {error:logError}=await db.from('mimo_whatsapp_diagnosticos').insert({empresa_id:v.empresa_id,vinculo_id:v.id,message_id:mensagem.messageId,codigo:'recebimento_falhou'});
  if(logError)console.error('[mimo-whatsapp] diagnostico_indisponivel');
  throw new Error('mimo_recebimento_falhou');
 }
 return true;
}
