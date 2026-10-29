import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';
import type { PapelMimo } from '@/lib/mimo-acesso';

export const PERFIS = { emporio: 'Empório', supermercado: 'Supermercado', farmacia: 'Farmácia', distribuidor: 'Distribuidor', representante: 'Representante', outro: 'Outro' };
export const ORIGENS = { meta_ads: 'Meta Ads', whatsapp: 'WhatsApp', indicacao: 'Indicação', organico: 'Orgânico', outra: 'Outra' };
export const ETAPAS = { novo: 'Novo', contato_realizado: 'Contato realizado', em_negociacao: 'Em negociação', pedido_fechado: 'Pedido fechado', perdido: 'Perdido' };
export const QUALIFICACOES = { pendente: 'Pendente', qualificado: 'Qualificado', nao_qualificado: 'Não qualificado' };
export type MimoLead = Database['public']['Tables']['mimo_leads']['Row'];
export type MimoHistorico = Database['public']['Tables']['mimo_lead_historico']['Row'];
export function normalizarTelefoneMimo(valor: string) {
  let n = valor.replace(/\D/g, '');
  if (!n) return null;
  if (n.startsWith('00')) n = n.slice(2);
  if ([10, 11].includes(n.length)) n = `55${n}`;
  if (n.length < 12 || n.length > 15 || /^(\d)\1+$/.test(n)) throw new Error('Telefone inválido.');
  return n;
}
export const leadMimoSchema = z.object({
  id: z.string().uuid().optional(), updated_at: z.string().datetime().optional(),
  nome_empresa: z.string().trim().min(2).max(200), nome_contato: z.string().trim().max(200),
  telefone: z.string().max(40).refine(v => { try { normalizarTelefoneMimo(v); return true; } catch { return false; } }, 'Telefone inválido.'),
  perfil: z.enum(['emporio','supermercado','farmacia','distribuidor','representante','outro']),
  origem: z.enum(['meta_ads','whatsapp','indicacao','organico','outra']),
  campanha_origem: z.string().trim().max(200), anuncio_origem: z.string().trim().max(200),
  entrada_em: z.string().datetime(), etapa: z.enum(['novo','contato_realizado','em_negociacao','pedido_fechado','perdido']),
  qualificacao: z.enum(['pendente','qualificado','nao_qualificado']), responsavel_id: z.string().uuid().nullable(),
  valor_pedido: z.number().min(0).max(999999999999.99).nullable(), conversao_em: z.string().datetime().nullable(),
  motivo_perda: z.string().trim().max(2000), observacoes: z.string().max(10000),
}).superRefine((v, ctx) => {
  const erro = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.etapa === 'pedido_fechado' && (v.valor_pedido === null || !v.conversao_em)) erro('valor_pedido', 'Informe valor e data do pedido.');
  if (v.etapa === 'perdido' && !v.motivo_perda) erro('motivo_perda', 'Informe o motivo da perda.');
  if (v.conversao_em && v.conversao_em < v.entrada_em) erro('conversao_em', 'A conversão não pode preceder a entrada.');
  if (Date.parse(v.entrada_em) > Date.now() + 300000 || (v.conversao_em && Date.parse(v.conversao_em) > Date.now() + 300000)) erro('entrada_em', 'Não use datas futuras.');
});
export type LeadMimoInput = z.infer<typeof leadMimoSchema>;
export function podeEditarLead(papel: PapelMimo, usuario: string, responsavel: string | null) {
  return papel !== 'vendedor' || usuario === responsavel;
}