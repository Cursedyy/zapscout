import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { exigirMimo } from './mimo-leads.server';
import { comercialClient } from './mimo-comercial-db';
import { podeComercial, schemaAusente, FOLLOW_INDISPONIVEL, resumoPedidos, type FollowInput } from './mimo-comercial';
import { tiraClient } from './mimo-pedido-db';
export async function exigirComercial(db: SupabaseClient<Database>, ator: string, lead?: string) {
  const acesso=await exigirMimo(db,ator);
  if (!podeComercial(acesso.papel)) throw Error('Acesso negado.');
  if (lead) {
    const r=await db.from('mimo_leads').select('id,responsavel_id').eq('empresa_id',acesso.empresaId).eq('id',lead).maybeSingle();
    if (r.error || !r.data) throw Error('Lead indisponível para seu acesso atual.');
  }
  return acesso;
}
export async function lerFollowups(db: SupabaseClient<Database>, ator: string, lead?: string) {
  const a=await exigirComercial(db,ator,lead);const client=comercialClient(db);
  let q=client.from('mimo_lead_followups').select('*').eq('empresa_id',a.empresaId);
  if(lead) q=q.eq('lead_id',lead);
  const r=await q.order('prazo').order('id').limit(2001);
  if(schemaAusente(r.error)) return { disponivel:false as const, motivo:FOLLOW_INDISPONIVEL };
  if(r.error) throw Error('Não foi possível consultar follow-ups. Tente novamente; contagens indisponíveis.');
  if ((r.data?.length??0)>2000) throw Error('Há mais agendamentos que o limite desta consulta. Abra um lead para consultar seus follow-ups. Contagens gerais indisponíveis.');
  const h=lead ? await client.from('mimo_lead_followup_historico').select('id,empresa_id,follow_id,lead_id,ator_id,acao,created_at,anterior,atual').eq('empresa_id',a.empresaId).eq('lead_id',lead).order('created_at',{ascending:false}).limit(100) : null;
  if(h?.error) { if(schemaAusente(h.error)) return {disponivel:false as const,motivo:FOLLOW_INDISPONIVEL}; throw Error('Não foi possível carregar a trilha dos follow-ups.'); }
  return { disponivel:true as const, itens:r.data??[], historico:h?.data??[], agora:new Date().toISOString() };
}
export async function operarFollowup(db: SupabaseClient<Database>, ator: string, input: FollowInput) {
  const a=await exigirComercial(db,ator,input.lead_id);
  const r=await comercialClient(db).rpc('mimo_lead_followup_operar',{_empresa:a.empresaId,_dados:input as unknown as Json});
  if(schemaAusente(r.error)) throw Error(FOLLOW_INDISPONIVEL);
  if(r.error?.code==='40001') throw Error('Este follow-up mudou. Atualize os registros e revise sua edição antes de tentar novamente.');
  if(r.error) throw Error('Não foi possível salvar. Confira data, responsável e acesso; sua edição foi preservada.');
  if(!r.data) throw Error('Não houve confirmação de gravação. Atualize antes de tentar novamente.');
  return r.data;
}
/** Allowlist provider evidence only, never return raw payloads/URLs/tokens. */
export function evidenciaSegura(v: Json | null) {
  if(!v || typeof v!=='object' || Array.isArray(v)) return null;
  const get=(key:string)=>typeof v[key]==='string' ? String(v[key]).slice(0,200) : null;
  const source=get('id')??get('source_id');const title=get('headline')??get('title');const type=get('fonte')??get('source_type');
  return source||title||type ? {referencia:source,titulo:title,tipo:type} : null;
}
export async function lerContextoComercial(db: SupabaseClient<Database>, ator:string, id:string) {
  const a=await exigirComercial(db,ator,id);
  const l=await db.from('mimo_leads').select('entrada_em,origem,campanha_origem,anuncio_origem,etapa,valor_pedido,conversao_em').eq('empresa_id',a.empresaId).eq('id',id).single();
  if(l.error) throw Error('Não foi possível carregar o contexto.');
  // Bindings contain credentials and are admin-only. Privileged projection is confined
  // to confirmed IDs, after caller-scoped lead authorization, and never returned.
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const b=await supabaseAdmin.from('mimo_whatsapp_vinculos').select('id').eq('empresa_id',a.empresaId).not('confirmado_em','is',null).not('confirmado_por','is',null);
  if(b.error) throw Error('Não foi possível verificar os contatos comerciais.');
  const ids=(b.data??[]).map(v=>v.id);
  const contatos=[] as {direcao:string;contato_em:string;texto:string;evidencia:ReturnType<typeof evidenciaSegura>}[];
  for(const direcao of ['recebida','enviada']) {
    if(!ids.length) continue;
    const e=await comercialClient(db).from('mimo_whatsapp_eventos').select('direcao,contato_em,texto,referencia_anuncio').eq('empresa_id',a.empresaId).eq('lead_id',id).in('vinculo_id',ids).eq('direcao',direcao).order('contato_em',{ascending:false}).limit(1);
    if(e.error) throw Error('Não foi possível carregar os últimos contatos.');
    contatos.push(...(e.data??[]).map(v=>({direcao:v.direcao,contato_em:v.contato_em,texto:v.texto,evidencia:evidenciaSegura(v.referencia_anuncio)})));
  }
  const ev=ids.length ? await comercialClient(db).from('mimo_whatsapp_eventos').select('contato_em,referencia_anuncio').eq('empresa_id',a.empresaId).eq('lead_id',id).in('vinculo_id',ids).not('referencia_anuncio','is',null).order('contato_em',{ascending:false}).limit(20) : null;
  if(ev?.error) throw Error('Não foi possível consultar evidências de anúncio.');
  const pedidos=await tiraClient(db).from('mimo_tira_pedidos_seguros').select('id,numero,status,total').eq('empresa_id',a.empresaId).eq('lead_id',id).order('numero',{ascending:false}).limit(501);
  if(pedidos.error && !schemaAusente(pedidos.error)) throw Error('Não foi possível consultar pedidos vinculados.');
  const completos=!pedidos.error && (pedidos.data?.length??0)<=500;
  return {lead:l.data,contatos,evidencias:(ev?.data??[]).flatMap(v=>{const evidencia=evidenciaSegura(v.referencia_anuncio);return evidencia?[{contato_em:v.contato_em,...evidencia}]:[];}),pedidos:completos?pedidos.data??[]:null,resumo:completos?resumoPedidos(pedidos.data??[]):null};
}
