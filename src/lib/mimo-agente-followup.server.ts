import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseAdmin} from '@/integrations/supabase/client.server';
import type {Database} from '@/integrations/supabase/types';
type Db=Omit<Database,'public'>&{public:Omit<Database['public'],'Functions'>&{Functions:Database['public']['Functions']&{mimo_agente_followup_agendar:{Args:Record<string,never>;Returns:number}}}};
export async function agendarFollowupMimo(){
 const r=await (supabaseAdmin as unknown as SupabaseClient<Db>).rpc('mimo_agente_followup_agendar',{});
 if(r.error)throw Error('followup_agendamento_indisponivel');
 return r.data;
}
