import type { Database, Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
type RegistroPedido={id:string;empresa_id:string;lead_id:string;numero:number;versao:number;documento:Json;pix:Json;recebimentos:Json;total:number;produtos:number;frete:number;status:string;created_at:string;updated_at:string};
type Config={empresa_id:string;catalogo:Json;modelos:Json;taxas:Json;brindes:Json;caixas:Json;updated_at:string};
type Versao={id:string;empresa_id:string;pedido_id:string;versao:number;documento:Json;autor_id:string;created_at:string;acao:string;snapshot:Json;detalhes:Json};
export type TiraDatabase=Omit<Database,'public'>&{public:Omit<Database['public'],'Tables'|'Functions'>&{
  Tables:Database['public']['Tables']&{mimo_tira_config:Table<Config>;mimo_tira_config_segura:Table<Config>;mimo_tira_pedidos:Table<RegistroPedido>;mimo_tira_pedidos_seguros:Table<RegistroPedido>;mimo_tira_versoes:Table<Versao>;mimo_tira_versoes_seguras:Table<Versao>;mimo_tira_config_historico:Table<{id:string;empresa_id:string;config:Json;autor_id:string;created_at:string}>;mimo_tira_propostas:Table<{id:string;empresa_id:string;pedido_id:string;versao:number;numero:string;documento:Json;arquivo:string;hash:string;autor_id:string;created_at:string}>};
  Functions:Database['public']['Functions']&{
    mimo_tira_salvar:{Args:{_empresa:string;_ator:string;_id:string;_versao:number;_documento:Json;_total:number;_produtos:number;_frete:number};Returns:RegistroPedido};
    mimo_tira_configurar:{Args:{_empresa:string;_ator:string;_versao:string|null;_catalogo:Json;_modelos:Json;_taxas:Json;_brindes:Json;_caixas:Json};Returns:Config};
    mimo_tira_status:{Args:{_empresa:string;_ator:string;_id:string;_versao:number;_status:string;_motivo:string|null;_faturado:string|null};Returns:RegistroPedido};
    mimo_tira_proposta:{Args:{_empresa:string;_ator:string;_id:string;_versao:number;_pedido:string;_arquivo:string;_hash:string;_documento:Json};Returns:{id:string;numero:string}};
    mimo_tira_receber:{Args:{_empresa:string;_ator:string;_id:string;_versao:number;_operacao:string;_valor:number};Returns:RegistroPedido};
  };
}};
// Temporary explicit schema contract until the reviewed additive migration is applied.
export function tiraClient(client:SupabaseClient<Database>){return client as unknown as SupabaseClient<TiraDatabase>;}