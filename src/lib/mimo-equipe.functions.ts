import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const papel = z.enum(['administrador', 'gestor', 'vendedor']);

// Every action is re-authorized inside security-definer RPCs; the UI never decides permissions.
export const listarEquipeMimo = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  const acesso = await exigirMimo(context.supabase, context.userId);
  if (acesso.papel === 'vendedor') throw new Error('Acesso negado.');
  const [membros, auditoria] = await Promise.all([
    context.supabase.rpc('mimo_listar_membros', { _empresa: acesso.empresaId }),
    context.supabase.from('mimo_auditoria_admin').select('id,autor_id,acao,alvo_user_id,alvo_lead_id,contexto,created_at')
      .eq('empresa_id', acesso.empresaId).order('created_at', { ascending: false }).limit(100),
  ]);
  if (membros.error || auditoria.error) throw new Error('Não foi possível carregar a equipe.');
  return { papel: acesso.papel, usuarioId: context.userId, membros: membros.data ?? [], auditoria: auditoria.data ?? [] };
});

async function empresa(context: { supabase: any; userId: string }) {
  const { exigirMimo } = await import('@/lib/mimo-leads.server');
  return (await exigirMimo(context.supabase, context.userId)).empresaId;
}
function falha(error: { code?: string } | null, padrao: string): never {
  throw new Error(error?.code === '42501' ? 'Você não tem permissão para esta ação.' : padrao);
}

export const convidarMembroMimo = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ email: z.string().trim().email().max(320), papel }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc('mimo_convidar_membro', { _empresa: await empresa(context), _email: data.email, _papel: data.papel });
    if (error) falha(error, 'Não foi possível adicionar o membro.');
    return r as string;
  });

export const alterarPapelMimo = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ userId: z.string().uuid(), papel }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc('mimo_alterar_papel', { _empresa: await empresa(context), _user: data.userId, _papel: data.papel });
    if (error) falha(error, 'Não foi possível alterar a função. Verifique se a empresa continua com um administrador ativo.');
    return true;
  });

export const definirAtivoMimo = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc('mimo_definir_ativo', { _empresa: await empresa(context), _user: data.userId, _ativo: data.ativo });
    if (error) falha(error, 'Não foi possível alterar o status. Verifique se a empresa continua com um administrador ativo.');
    return true;
  });

export const reatribuirLeadsMimo = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ de: z.string().uuid(), para: z.string().uuid() }).refine((x) => x.de !== x.para).parse(v))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await context.supabase.rpc('mimo_reatribuir_leads', { _empresa: await empresa(context), _para: data.para, _de: data.de });
    if (error) falha(error, 'Não foi possível transferir os leads.');
    return n as number;
  });
