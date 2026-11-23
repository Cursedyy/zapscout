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
// Atalho do pop-up: muda só a qualificação e deixa o histórico para o trigger de auditoria.
export async function atualizarQualificacaoLead(
  db: SupabaseClient<Database>,
  userId: string,
  entrada: { id: string; qualificacao: 'qualificado' | 'nao_qualificado' },
) {
  const acesso = await exigirMimo(db,userId);
  const { data: atual } = await db.from('mimo_leads').select('responsavel_id').eq('empresa_id',acesso.empresaId).eq('id',entrada.id).maybeSingle();
  if (!atual || !podeEditarLead(acesso.papel,userId,atual.responsavel_id)) throw new Error('Acesso negado.');
  const { error } = await db.from('mimo_leads').update({ qualificacao: entrada.qualificacao }).eq('empresa_id',acesso.empresaId).eq('id',entrada.id);
  if (error) throw new Error('Não foi possível qualificar o lead.');
  return { ok: true };
}
export async function salvarLeadMimo(db: SupabaseClient<Database>, userId: string, input: LeadMimoInput) {
  const acesso = await exigirMimo(db,userId);
  const { id, updated_at, ...campos } = input;
  if (!podeEditarLead(acesso.papel,userId,campos.responsavel_id)) throw new Error('Este cargo não edita leads comerciais.');
  if (!id && acesso.papel==='vendedor' && campos.responsavel_id!==userId) throw new Error('Novo lead deve ter você como responsável.');
  if (!id && acesso.papel==='vendedor' && campos.prioridade_revisada) throw new Error('Só administrador ou gestor revisa a prioridade.');
  if (id) {
    const { data: atual } = await db.from('mimo_leads').select('responsavel_id,prioridade_revisada').eq('empresa_id',acesso.empresaId).eq('id',id).maybeSingle();
    if (!atual || !podeEditarLead(acesso.papel,userId,atual.responsavel_id)) throw new Error('Acesso negado.');
    if (acesso.papel==='vendedor' && campos.responsavel_id!==atual.responsavel_id) throw new Error('Só a gestão reatribui o responsável do lead.');
    if (!updated_at) throw new Error('Reabra o lead antes de salvar.');
    if (acesso.papel==='vendedor' && campos.prioridade_revisada!==(atual.prioridade_revisada??null)) throw new Error('Só administrador ou gestor revisa a prioridade.');
  }
  const query = id
    ? db.from('mimo_leads').update(campos).eq('empresa_id',acesso.empresaId).eq('id',id).eq('updated_at',updated_at ?? '')
    : db.from('mimo_leads').insert({ ...campos,empresa_id:acesso.empresaId,created_by:userId });
  const { data, error } = await query.select('id').maybeSingle();
  if (error?.code === '23505') throw new Error('Já existe um lead com este telefone. Edite o cadastro existente para preservar o histórico.');
  if (error) {
    const mensagem=String(error.message??'').toLocaleLowerCase('pt-BR');
    if (mensagem.includes('responsável inválido')) throw new Error('O responsável selecionado não pode receber leads. Escolha um administrador, gestor ou vendedor ativo.');
    if (mensagem.includes('data de entrada inválida')) throw new Error('A data de entrada não pode estar no futuro.');
    if (mensagem.includes('data de conversão inválida')) throw new Error('A data de conversão deve ser igual ou posterior à entrada e não pode estar no futuro.');
    if (mensagem.includes('informe o valor e a data do pedido fechado')) throw new Error('Para fechar o lead, informe o valor e a data da conversão.');
    if (mensagem.includes('só administrador ou gestor revisa a prioridade')) throw new Error('Só administrador ou gestor pode alterar a prioridade revisada.');
    if (mensagem.includes('não é permitido reatribuir este lead')) throw new Error('Seu cargo não pode alterar o responsável deste lead.');
    throw new Error('Não foi possível salvar o lead. Confira os campos e tente novamente.');
  }
  if (!data) throw new Error('O lead mudou durante a edição. Reabra antes de salvar.');
  return data;
}