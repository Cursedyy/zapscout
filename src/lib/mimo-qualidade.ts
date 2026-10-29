// Pure, client-safe rules for loss reasons, duplicate hints and suggested priority.
// No external AI: `sugerirPrioridade` is a deterministic recommendation that a future
// model-based provider can replace behind the same return shape.

export const MOTIVOS_PERDA = {
  preco: 'Preço',
  falta_interesse: 'Falta de interesse',
  falta_orcamento: 'Falta de orçamento',
  sem_resposta: 'Sem resposta',
  sem_perfil: 'Sem perfil',
  concorrente: 'Concorrente',
} as const;
export type MotivoPerda = keyof typeof MOTIVOS_PERDA;
export const CODIGOS_MOTIVO = Object.keys(MOTIVOS_PERDA) as [MotivoPerda, ...MotivoPerda[]];

export const PRIORIDADES = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;
export type Prioridade = keyof typeof PRIORIDADES;

export function normalizarEmailMimo(v: string) {
  const e = v.trim().toLowerCase();
  return e || null;
}

export type LeadPrioridadeInput = {
  etapa: string; qualificacao: string; perfil: string;
  orcamento_estimado: number | null;
  ultimo_contato_whatsapp_em: string | null;
};
export type SugestaoPrioridade =
  | { tipo: 'encerrado'; motivo: string }
  | { tipo: 'insuficiente'; faltam: string[] }
  | { tipo: 'sugestao'; nivel: Prioridade; motivos: string[]; proximaAcao: string };

const PERFIS_VOLUME = ['distribuidor', 'supermercado', 'representante'];

export function sugerirPrioridade(l: LeadPrioridadeInput, agora = Date.now()): SugestaoPrioridade {
  if (l.etapa === 'pedido_fechado') return { tipo: 'encerrado', motivo: 'Pedido fechado.' };
  if (l.etapa === 'perdido') return { tipo: 'encerrado', motivo: 'Lead marcado como perdido.' };
  const motivos: string[] = []; const faltam: string[] = [];
  let pontos = 0; let sinais = 0;

  if (l.etapa === 'em_negociacao') { pontos += 2; sinais++; motivos.push('Está em negociação'); }
  else if (l.etapa === 'contato_realizado') { pontos += 1; sinais++; motivos.push('Já houve contato'); }
  else faltam.push('interesse (etapa ainda "Novo")');

  if (l.qualificacao === 'qualificado') { pontos += 2; sinais++; motivos.push('Qualificado'); }
  else if (l.qualificacao === 'nao_qualificado') { pontos -= 2; sinais++; motivos.push('Marcado como não qualificado'); }
  else faltam.push('qualificação');

  if (PERFIS_VOLUME.includes(l.perfil)) { pontos += 1; sinais++; motivos.push('Perfil de maior volume'); }
  else if (l.perfil !== 'outro') { sinais++; motivos.push('Perfil varejo'); }
  else faltam.push('perfil');

  if (l.orcamento_estimado !== null) {
    sinais++;
    if (l.orcamento_estimado >= 5000) { pontos += 2; motivos.push('Orçamento informado alto'); }
    else if (l.orcamento_estimado > 0) { pontos += 1; motivos.push('Orçamento informado'); }
    else { pontos -= 1; motivos.push('Sem orçamento disponível'); }
  } else faltam.push('orçamento');

  if (l.ultimo_contato_whatsapp_em) {
    sinais++;
    const dias = (agora - Date.parse(l.ultimo_contato_whatsapp_em)) / 86400000;
    if (dias <= 7) { pontos += 1; motivos.push('Conversa recente no WhatsApp'); }
    else if (dias > 30) { pontos -= 1; motivos.push('Sem conversa há mais de 30 dias'); }
    else motivos.push('Última conversa entre 7 e 30 dias');
  } else faltam.push('respostas no WhatsApp');

  if (sinais < 2) return { tipo: 'insuficiente', faltam };
  const nivel: Prioridade = pontos >= 4 ? 'alta' : pontos >= 1 ? 'media' : 'baixa';
  let proximaAcao: string;
  if (l.qualificacao === 'nao_qualificado') proximaAcao = 'Confirmar se o lead deve ser encerrado como perdido (sem perfil).';
  else if (nivel === 'alta') proximaAcao = l.etapa === 'em_negociacao' ? 'Enviar proposta ou fechar o pedido ainda hoje.' : 'Ligar ou chamar no WhatsApp hoje e avançar para negociação.';
  else if (l.qualificacao === 'pendente') proximaAcao = 'Qualificar: confirmar perfil, volume e orçamento.';
  else if (l.etapa === 'novo') proximaAcao = 'Fazer o primeiro contato.';
  else proximaAcao = 'Agendar follow-up nos próximos dias.';
  return { tipo: 'sugestao', nivel, motivos, proximaAcao };
}

export type LeadPerda = { motivo_perda_codigo: string | null; responsavel_id: string | null };
export function resumirPerdas(leads: LeadPerda[]) {
  const geral: Record<string, number> = {};
  const porResponsavel: Record<string, Record<string, number>> = {};
  for (const l of leads) {
    const m = l.motivo_perda_codigo && l.motivo_perda_codigo in MOTIVOS_PERDA ? l.motivo_perda_codigo : 'sem_codigo';
    const r = l.responsavel_id ?? 'sem';
    geral[m] = (geral[m] ?? 0) + 1;
    (porResponsavel[r] ??= {})[m] = (porResponsavel[r][m] ?? 0) + 1;
  }
  return { total: leads.length, geral, porResponsavel };
}
