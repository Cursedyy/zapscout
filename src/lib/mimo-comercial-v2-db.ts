import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database,Json} from '@/integrations/supabase/types';
import type {ConversaoPedido} from './mimo-comercial-v2';
type Aviso={empresa_id:string;membro_id:string;vinculo_id:string;numero:string;versao:number;confirmado_por:string;confirmado_em:string};
type Vinculo=Database['public']['Tables']['mimo_whatsapp_vinculos']['Row']&{finalidade:'entrada'|'fechamento'|null};
type T<R>={Row:R;Insert:Partial<R>;Update:Partial<R>;Relationships:[]};
export type ComercialV2=Omit<Database,'public'>&{public:Omit<Database['public'],'Tables'|'Functions'>&{
 Tables:Database['public']['Tables']&{mimo_whatsapp_vinculos:T<Vinculo>;mimo_follow_aviso_config:T<Aviso>;mimo_pedidos_conversao:T<ConversaoPedido&{empresa_id:string;id:string}>};
 Functions:Database['public']['Functions']&{
  mimo_comercial_capacidade:{Args:{_empresa:string};Returns:number};
  mimo_comercial_auxiliar_reservar:{Args:{_empresa:string;_ator:string;_slot:string};Returns:{id:string;criada:boolean}};
  mimo_comercial_vincular:{Args:{_empresa:string;_ator:string;_instancia:string|null;_hash:string;_numero:string;_finalidade:string};Returns:string};
  mimo_follow_aviso_configurar:{Args:{_empresa:string;_dados:Json};Returns:number};
 };
}};
export const comercialV2=(db:SupabaseClient<Database>)=>db as unknown as SupabaseClient<ComercialV2>;