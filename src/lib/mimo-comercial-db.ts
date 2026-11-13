import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import type { Follow, FollowHistorico } from './mimo-comercial';
type Table<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };
/** Explicit prepared-schema contract; do not change the generated Cloud types. */
export type ComercialDatabase = Omit<Database,'public'> & { public: Omit<Database['public'],'Tables'|'Functions'> & {
  Tables: Database['public']['Tables'] & { mimo_lead_followups: Table<Follow>; mimo_lead_followup_historico: Table<FollowHistorico> };
  Functions: Database['public']['Functions'] & { mimo_lead_followup_operar: { Args: {_empresa: string; _dados: Json}; Returns: Follow } };
}};
export const comercialClient = (db: SupabaseClient<Database>) => db as unknown as SupabaseClient<ComercialDatabase>;