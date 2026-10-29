import { describe, it, expect } from 'vitest';
import { sugerirPrioridade, resumirPerdas, CODIGOS_MOTIVO } from './mimo-qualidade';
import { leadMimoSchema } from './mimo-leads';

const base = { etapa: 'novo', qualificacao: 'pendente', perfil: 'outro', orcamento_estimado: null, ultimo_contato_whatsapp_em: null };
const agora = Date.parse('2026-10-29T12:00:00Z');
const lead = { nome_empresa: 'Empresa', nome_contato: '', telefone: '', email: '', perfil: 'outro', origem: 'outra', campanha_origem: '', anuncio_origem: '', entrada_em: '2026-10-01T12:00:00.000Z', etapa: 'novo', qualificacao: 'pendente', responsavel_id: null, valor_pedido: null, conversao_em: null, motivo_perda: '', motivo_perda_codigo: null, orcamento_estimado: null, prioridade_revisada: null, observacoes: '' };

describe('MiMo motivos de perda', () => {
  it('são exatamente os seis padronizados', () => expect(CODIGOS_MOTIVO).toEqual(['preco', 'falta_interesse', 'falta_orcamento', 'sem_resposta', 'sem_perfil', 'concorrente']));
  it('exige motivo ao marcar como perdido', () => expect(leadMimoSchema.safeParse({ ...lead, etapa: 'perdido' }).success).toBe(false));
  it('aceita motivo padrão com observação opcional', () => expect(leadMimoSchema.safeParse({ ...lead, etapa: 'perdido', motivo_perda_codigo: 'preco' }).success).toBe(true));
  it('rejeita e-mail inválido', () => expect(leadMimoSchema.safeParse({ ...lead, email: 'x@' }).success).toBe(false));
  it('agrupa perdas por motivo e por responsável', () => {
    const r = resumirPerdas([{ motivo_perda_codigo: 'preco', responsavel_id: 'a' }, { motivo_perda_codigo: 'preco', responsavel_id: 'b' }, { motivo_perda_codigo: null, responsavel_id: 'a' }]);
    expect(r.geral).toEqual({ preco: 2, sem_codigo: 1 });
    expect(r.porResponsavel.a).toEqual({ preco: 1, sem_codigo: 1 });
  });
});

describe('MiMo prioridade sugerida', () => {
  it('informa dados insuficientes em vez de classificar', () => expect(sugerirPrioridade(base, agora).tipo).toBe('insuficiente'));
  it('alta para negociação qualificada com orçamento', () => {
    const s = sugerirPrioridade({ ...base, etapa: 'em_negociacao', qualificacao: 'qualificado', orcamento_estimado: 8000 }, agora);
    expect(s.tipo === 'sugestao' && s.nivel).toBe('alta');
  });
  it('baixa para não qualificado sem conversa recente', () => {
    const s = sugerirPrioridade({ ...base, qualificacao: 'nao_qualificado', ultimo_contato_whatsapp_em: '2026-09-01T12:00:00Z' }, agora);
    expect(s.tipo === 'sugestao' && s.nivel).toBe('baixa');
  });
  it('não sugere para lead encerrado', () => expect(sugerirPrioridade({ ...base, etapa: 'perdido' }, agora).tipo).toBe('encerrado'));
});
