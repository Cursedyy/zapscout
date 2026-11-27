import { describe, expect, it } from 'vitest';
import { novoPedido, pedidoSchema, responsavelDoPedido, type Pedido } from './mimo-pedido';
import { prepararResponsavel, snapshotCliente } from './mimo-tira-regras';

const VENDEDORA = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const SAIU = '33333333-3333-4333-8333-333333333333';
const equipe = new Set([VENDEDORA, ADMIN]);
const pedido = (extra: Partial<Pedido> = {}): Pedido => ({ ...novoPedido(), responsavelId: VENDEDORA, ...extra });

describe('responsável próprio do pedido', () => {
  it('sem escolha vale o responsável do cliente; com escolha, o do pedido', () => {
    expect(responsavelDoPedido(pedido())).toBe(VENDEDORA);
    expect(responsavelDoPedido(pedido({ responsavelPedidoId: ADMIN }))).toBe(ADMIN);
    expect(responsavelDoPedido({ responsavelId: null, responsavelPedidoId: null })).toBeNull();
  });
  it('documentos antigos sem o campo continuam válidos', () => {
    const { responsavelPedidoId: _, ...antigo } = pedido();
    expect(pedidoSchema.parse(antigo).responsavelPedidoId).toBeUndefined();
  });
  it('administrador e gestor passam o pedido para outro membro da equipe', () => {
    expect(prepararResponsavel(pedido({ responsavelPedidoId: ADMIN }), 'administrador', pedido(), equipe).responsavelPedidoId).toBe(ADMIN);
    expect(prepararResponsavel(pedido({ responsavelPedidoId: ADMIN }), 'gestor', null, equipe).responsavelPedidoId).toBe(ADMIN);
  });
  it('a gestão pode voltar ao responsável do cliente', () => {
    expect(prepararResponsavel(pedido({ responsavelPedidoId: null }), 'administrador', pedido({ responsavelPedidoId: ADMIN }), equipe).responsavelPedidoId).toBeNull();
  });
  it('recusa quem não está ativo na equipe comercial', () => {
    expect(() => prepararResponsavel(pedido({ responsavelPedidoId: SAIU }), 'administrador', pedido(), equipe)).toThrow('Responsável indisponível');
  });
  it('mantém um responsável que saiu da equipe enquanto ninguém o troca', () => {
    const anterior = pedido({ responsavelPedidoId: SAIU });
    expect(prepararResponsavel(pedido({ responsavelPedidoId: SAIU }), 'administrador', anterior, new Set()).responsavelPedidoId).toBe(SAIU);
  });
  it('vendedor e administrativo não mudam o responsável: vale o anterior', () => {
    const anterior = pedido({ responsavelPedidoId: ADMIN });
    expect(prepararResponsavel(pedido({ responsavelPedidoId: VENDEDORA }), 'vendedor', anterior, equipe).responsavelPedidoId).toBe(ADMIN);
    expect(prepararResponsavel(pedido({ responsavelPedidoId: null }), 'administrativo', anterior, equipe).responsavelPedidoId).toBe(ADMIN);
    expect(prepararResponsavel(pedido({ responsavelPedidoId: ADMIN }), 'vendedor', null, equipe).responsavelPedidoId).toBeNull();
  });
  it('a proposta do cliente não leva o responsável', () => {
    expect(snapshotCliente(pedido({ responsavelPedidoId: ADMIN })).responsavelPedidoId).toBeNull();
  });
});
