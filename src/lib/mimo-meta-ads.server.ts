import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { exigirMimo } from '@/lib/mimo-leads.server';
import { analisarCsvMeta, sha256Hex } from '@/lib/mimo-meta-ads';

export async function executarImportacaoMeta(db: SupabaseClient<Database>, userId: string, nome: string, texto: string) {
  const acesso = await exigirMimo(db, userId);
  if (acesso.papel !== 'administrador' && acesso.papel !== 'gestor') throw new Error('Somente administradores e gestores podem importar.');
  const r = analisarCsvMeta(texto); // server re-validates; preview is never trusted
  if (r.erroGeral) throw new Error(r.erroGeral);
  const hash = await sha256Hex(texto);
  const { data: existente } = await db.from('mimo_meta_ads_importacoes').select('id,created_at').eq('empresa_id', acesso.empresaId).eq('arquivo_sha256', hash).maybeSingle();
  if (existente) throw new Error('Este arquivo já foi importado. Nada foi somado novamente.');
  const linhas = r.validas.map(({ linha: _l, ...l }) => l);
  const erros = r.erros.slice(0, 500);
  const { data, error } = await db.rpc('mimo_importar_meta_ads', {
    _empresa: acesso.empresaId, _nome: nome, _sha256: hash, _linhas: linhas as unknown as Json, _erros: erros as unknown as Json, _total: r.total,
  });
  if (error?.code === '23505') throw new Error('Este arquivo já foi importado. Nada foi somado novamente.');
  if (error?.code === '42501') throw new Error('Somente administradores e gestores podem importar.');
  if (error) { console.error('mimo meta import', error.code); throw new Error('Não foi possível importar. Nada foi gravado.'); }
  return data as { id: string; novas: number; atualizadas: number };
}
