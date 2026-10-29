import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { META_MAX_BYTES } from '@/lib/mimo-meta-ads';

export const importarMetaAdsMimo = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({ nome: z.string().trim().min(1).max(200), texto: z.string().max(META_MAX_BYTES) }).parse(v))
  .handler(async ({ data, context }) => {
    const { executarImportacaoMeta } = await import('@/lib/mimo-meta-ads.server');
    return executarImportacaoMeta(context.supabase, context.userId, data.nome, data.texto);
  });

export const listarImportacoesMetaMimo = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exigirMimo } = await import('@/lib/mimo-leads.server');
    const acesso = await exigirMimo(context.supabase, context.userId);
    const { data, error } = await context.supabase.from('mimo_meta_ads_importacoes')
      .select('id,importado_por,arquivo_nome,linhas_total,linhas_novas,linhas_atualizadas,linhas_com_erro,erros,periodo_inicio,periodo_fim,created_at')
      .eq('empresa_id', acesso.empresaId).order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error('Não foi possível carregar o histórico.');
    const { data: membros } = await context.supabase.from('empresa_membros').select('user_id,papel').eq('empresa_id', acesso.empresaId).order('created_at');
    const nomes = Object.fromEntries((membros ?? []).map((m, i) => [m.user_id, m.user_id === context.userId ? 'Você' : `Membro ${i + 1} · ${m.papel}`]));
    return {
      papel: acesso.papel,
      podeImportar: acesso.papel === 'administrador' || acesso.papel === 'gestor',
      itens: (data ?? []).map(i => ({ ...i, responsavel: nomes[i.importado_por] ?? 'Membro removido' })),
    };
  });
