import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from '@/integrations/supabase/types';
import {supabaseAdmin} from '@/integrations/supabase/client.server';
type LearningDb=Omit<Database,'public'>&{public:Omit<Database['public'],'Tables'>&{Tables:Database['public']['Tables']&{
 mimo_agente_aprendizado:{Row:{empresa_id:string;perfil:Json;ator_id:string;created_at:string};Insert:never;Update:never;Relationships:[]};
}}};
const db=supabaseAdmin as unknown as SupabaseClient<LearningDb>;
export async function lerAprendizadoAgente(empresa:string){
 const r=await db.from('mimo_agente_aprendizado').select('perfil,ator_id').eq('empresa_id',empresa).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(r.error||!r.data)return null;
 const m=await supabaseAdmin.from('empresa_membros').select('papel').eq('empresa_id',empresa).eq('user_id',r.data.ator_id).eq('ativo',true).maybeSingle();
 return !m.error&&m.data&&['administrador','gestor'].includes(m.data.papel)?r.data.perfil:null;
}
