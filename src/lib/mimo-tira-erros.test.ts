import { describe, expect, it, vi } from 'vitest';
import { mensagemErroTira } from './mimo-tira-erros';
describe('mensagemErroTira', () => {
  it('conflito de versão pede reabrir', () => expect(mensagemErroTira({ code: '40001', message: 'conflito' }, 'salvar')).toMatch(/Reabra o pedido/));
  it('acesso negado explica permissão', () => expect(mensagemErroTira({ code: '42501', message: 'acesso negado' }, 'salvar')).toMatch(/acesso não permite/));
  it('pedido incompleto lista pendências', () => {
    const m = mensagemErroTira({ message: 'pedido incompleto ou cotação desatualizada' }, 'salvar', ['Defina quem paga o frete.', 'Confirme os volumes e seus pesos.']);
    expect(m).toContain('Defina quem paga o frete. • Confirme os volumes e seus pesos.');
  });
  it('cotação sem pendências locais aponta Logística', () => expect(mensagemErroTira({ message: 'pedido incompleto ou cotação desatualizada' }, 'salvar')).toMatch(/Aba Logística/));
  it('erro inesperado registra referência sem expor SQL', () => {
    const log = vi.fn();
    const m = mensagemErroTira({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, 'salvar', [], log);
    expect(m).not.toMatch(/duplicate|constraint/);
    const ref = /referência ([0-9A-F]{8})/.exec(m)?.[1];
    expect(ref).toBeTruthy();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ ref, code: '23505' }));
  });
});
