import { z } from 'zod';
export const FUSO_COMERCIAL = 'America/Sao_Paulo';
export const ESTADOS_FOLLOW = ['pendente', 'concluido', 'cancelado'] as const;
export type Follow = {
  id: string; empresa_id: string; lead_id: string; responsavel_id: string;
  prazo: string; observacao: string; estado: typeof ESTADOS_FOLLOW[number];
  versao: number; created_at: string; updated_at: string;
};
export type FollowHistorico = { id: string; follow_id: string; empresa_id: string; lead_id: string; ator_id: string; acao: string; created_at: string; anterior: Follow | null; atual: Follow };
export const followSchema = z.object({
  id: z.string().uuid(), lead_id: z.string().uuid(), versao: z.number().int().min(0),
  operacao_id: z.string().uuid(), acao: z.enum(['agendar', 'reagendar', 'concluir', 'cancelar']),
  responsavel_id: z.string().uuid(), prazo: z.string().datetime().refine(v => Number.isFinite(Date.parse(v)), 'Data inválida.'),
  observacao: z.string().trim().min(1, 'Informe uma observação.').max(500, 'Use até 500 caracteres.'),
}).strict();
export type FollowInput = z.infer<typeof followSchema>;
export const podeComercial = (papel: string) => ['administrador', 'gestor', 'vendedor'].includes(papel);
export function diaComercial(iso: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_COMERCIAL, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => p.find(v => v.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function localComercial(iso: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO_COMERCIAL, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (type: string) => p.find(v => v.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
/** Round-trip through the named timezone; never rely on the device timezone. */
export function isoComercial(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw Error('Data e hora inválidas.');
  const wanted = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wanted) || new Date(wanted).toISOString().slice(0,16) !== local) throw Error('Data e hora inválidas.');
  let value = wanted;
  for (let n=0;n<3;n++) value += wanted - Date.parse(`${localComercial(new Date(value).toISOString())}:00Z`);
  const iso = new Date(value).toISOString();
  if (localComercial(iso) !== local) throw Error('Data e hora inválidas neste fuso.');
  return iso;
}
export const exibirComercial = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: FUSO_COMERCIAL });
export function categoriaFollow(f: Pick<Follow,'estado'|'prazo'>, agora: string) {
  if (f.estado !== 'pendente') return f.estado;
  if (Date.parse(f.prazo) < Date.parse(agora)) return 'atrasados';
  return diaComercial(f.prazo) === diaComercial(agora) ? 'hoje' : 'proximos';
}
export function contagensFollow(itens: Follow[], agora: string) {
  return itens.reduce((r,f) => { const k=categoriaFollow(f,agora); if (k==='hoje'||k==='atrasados'||k==='proximos') r[k]++; return r; }, { hoje:0, atrasados:0, proximos:0 });
}
export type PedidoContexto = { id: string; numero: number; status: string; total: number };
export function resumoPedidos(itens: PedidoContexto[]) {
  const vendas = itens.filter(p => ['confirmado','faturado','enviado','entregue'].includes(p.status));
  const faturados = itens.filter(p => ['faturado','enviado','entregue'].includes(p.status));
  return { vendas: vendas.length, valorConfirmado: vendas.reduce((s,p)=>s+p.total,0), faturados: faturados.length, valorFaturado: faturados.reduce((s,p)=>s+p.total,0) };
}
export const schemaAusente = (e: {code?: string} | null) => !!e && ['42P01','42883','PGRST202','PGRST205'].includes(e.code ?? '');
export const FOLLOW_INDISPONIVEL = 'Follow-ups indisponíveis: estrutura ainda não ativada. Nenhum agendamento foi salvo; contagens não disponíveis.';