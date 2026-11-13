import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from '@/integrations/supabase/types';
import {detectarLeadQuente,textoAlertaQuente,type MensagemObservada,type SinalQuente} from './mimo-agente-quentes';
import {obterRemetenteAgente} from './mimo-agente-worker.server';
import {processarAvisoInterno} from './mimo-follow-aviso-processador';
import {uazSendText} from './uazapi.server';
type Db=Omit<Database,'public'>&{public:Omit<Database['public'],'Functions'>&{Functions:Database['public']['Functions']&{
 mimo_quentes_operar:{Args:{_acao:string;_p:Json};Returns:Json};
}}};
export async function executarObservacaoMimo(){
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const db=supabaseAdmin as unknown as SupabaseClient<Db>;
 const op=async<T>(acao:string,p:unknown={}):Promise<T>=>{const r=await db.rpc('mimo_quentes_operar',{_acao:acao,_p:p as Json});if(r.error)throw Error('observacao_indisponivel');return r.data as T;};
 // Bounded batches drain bursts without delaying the internal notification indefinitely.
 for(let i=0;i<8;i++){
  const a=await op<null|{empresa_id:string;lead_id:string;reserva:string;sequencia:number;mensagens:MensagemObservada[]}>('reservar_analise');
  if(!a)break;
  await op('registrar_sinal',{empresa_id:a.empresa_id,lead_id:a.lead_id,reserva:a.reserva,sequencia:a.sequencia,...detectarLeadQuente(a.mensagens)});
 }
 const q=await op<null|{id:string;reserva:string;empresa_id:string;vinculo_id:string;destino:string;tipo:'teste'|'lead';nome:string;telefone:string;sinal:SinalQuente}>('reservar_alerta');
 if(!q)return 'sem_alertas';
 const chave={id:q.id,reserva:q.reserva};
 return processarAvisoInterno({
  preparar:async()=>{const token=await obterRemetenteAgente(q.empresa_id,q.vinculo_id);if(!token)return null;
   return {token,numero:q.destino,texto:q.tipo==='teste'?'MiMo · teste de aviso interno\nEste número receberá os avisos de leads com intenção de pedido ou revenda qualificada. Nenhuma mensagem foi enviada a clientes neste teste.':textoAlertaQuente(q.nome,q.telefone,q.sinal)};
  },
  autorizar:()=>op<boolean>('autorizar_alerta',chave),enviar:uazSendText,
  finalizar:async(aceita,id)=>{if(!await op<boolean>('finalizar_alerta',{...chave,message_id:aceita?id:null}))throw Error('observacao_registro_indisponivel');},
 });
}
