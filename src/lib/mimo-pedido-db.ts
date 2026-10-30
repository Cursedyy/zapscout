import type { Database, Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
type RegistroPedido={id:string;empresa_id:string;lead_id:string;numero:number;versao:number;documento:Json;pix:Json;recebimentos:Json;total:number;produtos:number;frete:number;status:string;created_at:string;updated_at:string};
type Config={empresa_id:string;catalogo:Json;modelos:Json;taxas:Json;updated_at:string};
type Versao={id:string;empresa_id:string;pedido_id:string;versao:number;documento:Json;autor_id:string;created_at:string;acao:string};
export type TiraDatabase=Omit<Database,'public'>&{public:Omit<Database['public'],'Tables'|'Functions'>&{
  Tables:Database['public']['Tables']&{mimo_tira_config:Table<Config>;mimo_tira_pedidos:Table<RegistroPedido>;mimo_tira_versoes:Table<Versao>};
  Functions:Database['public']['Functions']&{
    mimo_tira_salvar:{Args:{_empresa:string;_id:string;_versao:number;_documento:Json};Returns:RegistroPedido};
    mimo_tira_configurar:{Args:{_empresa:string;_versao:string|null;_catalogo:Json;_modelos:Json;_taxas:Json};Returns:Config};
    mimo_tira_receber:{Args:{_empresa:string;_id:string;_versao:number;_operacao:string;_valor:number};Returns:RegistroPedido};
  };
}};
// Temporary explicit schema contract until the reviewed additive migration is applied.
export function tiraClient(client:SupabaseClient<Database>){return client as unknown as SupabaseClient<TiraDatabase>;}