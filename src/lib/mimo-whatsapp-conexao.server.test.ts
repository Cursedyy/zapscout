import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const exigir = vi.hoisted(() => vi.fn());
vi.mock('./mimo-leads.server', () => ({ exigirMimo: exigir }));
vi.mock('./whatsapp.functions', () => ({ publicWebhookUrl: () => 'https://example.test/webhook' }));
import { acessoConexaoMimo, desafioNumeroMimo, verificarDesafioNumeroMimo, numeroConectado } from './mimo-whatsapp-conexao.server';
beforeEach(() => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'segredo-sintetico-apenas-local'); });
afterEach(() => vi.unstubAllEnvs());
describe('confirmação segura do WhatsApp comercial', () => {
  const agora = 100000000;
  it('aceita apenas a confirmação original dentro do prazo', () => {
    const d = desafioNumeroMimo('empresa', 'usuario', 'hash', '5511999999999', agora);
    expect(() => verificarDesafioNumeroMimo(d, 'empresa', 'usuario', 'hash', '5511999999999', agora + 1000)).not.toThrow();
    expect(() => verificarDesafioNumeroMimo(d, 'empresa', 'usuario', 'hash', '5511999999999', agora + 11 * 60000)).toThrow();
  });
  it.each([
    ['outra', 'usuario', 'hash', '5511999999999'],
    ['empresa', 'outro', 'hash', '5511999999999'],
    ['empresa', 'usuario', 'outro-token', '5511999999999'],
    ['empresa', 'usuario', 'hash', '5511888888888'],
  ])('rejeita troca de empresa, ator, conexão ou número: %s %s %s %s', (empresa, usuario, hash, numero) => {
    const d = desafioNumeroMimo('empresa', 'usuario', 'hash', '5511999999999', agora);
    expect(() => verificarDesafioNumeroMimo(d, empresa, usuario, hash, numero, agora)).toThrow();
  });
  it('não concede gestão da conexão a vendedor ou gestor', async () => {
    for (const papel of ['vendedor', 'gestor', 'marketing', 'administrativo']) {
      exigir.mockResolvedValueOnce({ empresaId: 'empresa', papel });
      await expect(acessoConexaoMimo({ supabase: {} as any, userId: 'usuario' })).rejects.toThrow(/administrador/);
    }
  });
  it('normaliza identificação do aparelho sem aceitar telefone inválido', () => {
    expect(numeroConectado('5511999999999:12@s.whatsapp.net')).toBe('5511999999999');
    expect(numeroConectado('desconhecido')).toBeNull();
  });
});
