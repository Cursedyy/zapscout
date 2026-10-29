import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { LeadMimoInput } from '@/lib/mimo-leads';
import { podeEditarLead } from '@/lib/mimo-leads';
import type { PapelMimo } from '@/lib/mimo-acesso';

export async function exigirMimo(db: SupabaseClient<Database>, userId: string) {
  const { data: empresa, error } = await db.from('empresas').select('id,ativa').eq('slug','mimo').maybeSingle();
  if (error || !empresa?.ativa) throw new Error('Acesso negado.');
  const { data: membro } = await db.from('empresa_membros').select('papel,ativo').eq('empresa_id',empresa.id).eq('user_id',userId).maybeSingle();
  if (!membro?.ativo) throw new Error('Acesso negado.');
  return { empresaId: empresa.id, papel: membro.papel as PapelMimo, usuarioId: userId };
}
export async function salvarLeadMimo(db: SupabaseClient<Database>, userId: string, input: LeadMimoInput) {
  const acesso = await exigirMimo(db,userId);
  const { id, updated_at, ...campos } = input;
  if (!podeEditarLead(acesso.papel,userId,campos.responsavel_id)) throw new Error('Você só pode editar seus leads.');
  if (id) {
    const { data: atual } = await db.from('mimo_leads').select('responsavel_id').eq('empresa_id',acesso.empresaId).eq('id',id).maybeSingle();
    if (!atual || !podeEditarLead(acesso.papel,userId,atual.responsavel_id)) throw new Error('Acesso negado.');
    if (!updated_at) throw new Error('Reabra o lead antes de salvar.');
  }
  const query = id
    ? db.from('mimo_leads').update(campos).eq('empresa_id',acesso.empresaId).eq('id',id).eq('updated_at',updated_at ?? '')
    : db.from('mimo_leads').insert({ ...campos,empresa_id:acesso.empresaId,created_by:userId });
  const { data, error } = await query.select('id').maybeSingle();
  if (error?.code === '23505') throw new Error('Já existe um lead com este telefone. Edite o cadastro existente para preservar o histórico.');
  if (error) throw new Error('Não foi possível salvar. Confira as datas e o responsável.');
  if (!data) throw new Error('O lead mudou durante a edição. Reabra antes de salvar.');
  return data;
}