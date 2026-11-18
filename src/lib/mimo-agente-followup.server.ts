import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseAdmin} from '@/integrations/supabase/client.server';
import type {Database} from '@/integrations/supabase/types';
type AgendaRpc = { Args: Record<string, never>; Returns: number };
type Db=Omit<Database,'public'>&{public:Omit<Database['public'],'Functions'>&{Functions:Database['public']['Functions']&{
  mimo_agente_followup_agendar: AgendaRpc;
  mimo_followups_ia_agendar: AgendaRpc;
}}};
export async function agendarFollowupMimo(){
 const r=await (supabaseAdmin as unknown as SupabaseClient<Db>).rpc('mimo_agente_followup_agendar',{});
 if(r.error)throw Error('followup_agendamento_indisponivel');
 return r.data;
}

export async function agendarFollowupsPainelMimo() {
  const r = await (supabaseAdmin as unknown as SupabaseClient<Db>).rpc('mimo_followups_ia_agendar', {});
  if (r.error?.code === 'PGRST202' || r.error?.code === '42883') return 'aguardando_migracao';
  if (r.error) throw Error('followup_painel_indisponivel');
  return r.data;
}
