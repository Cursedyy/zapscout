// @vitest-environment happy-dom
// Teste de interface SIMULADO: renderiza as telas reais do Tira-pedido com um servidor falso em memória.
// Não usa banco, autenticação nem rede; não substitui os testes reais de banco (feitos com transação desfeita).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { assinaturaFrete, sugerirCaixas, calcularPedido, carregarModelo, CATALOGO, MODELOS, novoPedido, type Pedido, type PedidoSalvo } from '@/lib/mimo-pedido';
import { CAIXAS_PADRAO } from '@/lib/mimo-tira-regras';

const s = vi.hoisted(() => ({ papel: 'vendedor' as string, pedidos: [] as any[], versoes: [] as any[], propostas: [] as any[], chamadas: [] as { fn: string; data: any }[], seq: 0 }));
const LEAD = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

vi.mock('@tanstack/react-start', () => {
  const chain: any = { middleware: () => chain, inputValidator: () => chain, validator: () => chain, handler: () => () => Promise.resolve() };
  return { useServerFn: (f: any) => f, createServerFn: () => chain };
});
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

function registrar(fn: string, data: any) { s.chamadas.push({ fn, data }); }
function versionar(p: any, acao: string) { s.versoes.push({ id: crypto.randomUUID(), pedido_id: p.id, versao: p.versao, acao, created_at: new Date().toISOString(), autor_id: USER, documento: structuredClone(p.documento), snapshot: { status: p.status, total: p.total }, detalhes: {} }); }
function totais(d: Pedido) { const r = calcularPedido(d); return { total: r.total, produtos: r.produtos, frete: r.frete }; }

vi.mock('@/lib/mimo-pedido.functions', () => ({
  carregarTiraMimo: async () => ({ empresaId: 'e', usuarioId: USER, papel: s.papel, disponivel: true, estruturasDisponiveis: true, leads: [{ id: LEAD, nome_empresa: 'Cliente Sintético', nome_contato: 'Teste', telefone: '', responsavel_id: USER }], pedidos: [], catalogo: CATALOGO, modelos: MODELOS, taxas: Array.from({ length: 12 }, (_, i) => (i === 0 ? 313 : i < 6 ? 368 : 589)), brindes: [], caixas: CAIXAS_PADRAO, configVersao: null }),
  listarPedidosMimo: async ({ data }: any) => { registrar('listar', data); const f = s.pedidos.filter(p => !data.status || p.status === data.status); const ini = (data.pagina - 1) * data.porPagina; return { itens: f.slice(ini, ini + data.porPagina), total: f.length }; },
  salvarPedidoMimo: async ({ data }: any) => {
    registrar('salvar', data);
    const atual = s.pedidos.find(p => p.id === data.id);
    if (atual && atual.versao !== data.versao) throw new Error('Pedido alterado por outra pessoa. Reabra antes de salvar.');
    const doc = { ...data.pedido, cliente: 'Cliente Sintético' };
    if (atual) { Object.assign(atual, { documento: doc, versao: atual.versao + 1, status: doc.status, ...totais(doc), updated_at: new Date().toISOString() }); versionar(atual, 'salvar'); return atual; }
    const novo = { id: data.id, numero: ++s.seq, versao: 1, empresa_id: 'e', lead_id: doc.leadId, documento: doc, pix: null, recebimentos: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: doc.status, ...totais(doc) };
    s.pedidos.push(novo); versionar(novo, 'salvar'); return novo;
  },
  receberPedidoMimo: async ({ data }: any) => { registrar('receber', data); const p = s.pedidos.find(x => x.id === data.id); const r = { operacao: data.operacao, valor: data.valor, usuarioId: USER, confirmadoEm: new Date().toISOString() }; p.recebimentos = [...p.recebimentos, r]; if (p.documento.pagamento.forma === 'pix') p.pix = r; p.versao++; versionar(p, 'recebimento'); return p; },
  alterarStatusPedidoMimo: async ({ data }: any) => { registrar('status', data); const p = s.pedidos.find(x => x.id === data.id); p.status = data.status; p.documento = { ...p.documento, status: data.status, pagamento: { ...p.documento.pagamento, faturadoEm: data.faturadoEm ?? p.documento.pagamento.faturadoEm } }; p.versao++; versionar(p, 'status'); return p; },
  historicoPedidoMimo: async ({ data }: any) => s.versoes.filter(v => v.pedido_id === data.id).sort((a, b) => b.versao - a.versao),
  restaurarVersaoMimo: async ({ data }: any) => { registrar('restaurar', data); const p = s.pedidos.find(x => x.id === data.id); const o = s.versoes.find(v => v.pedido_id === data.id && v.versao === data.versaoOrigem); p.documento = structuredClone(o.documento); p.versao++; versionar(p, 'restaurar'); return p; },
  emitirPropostaMimo: async ({ data }: any) => { registrar('emitir', data); const p = s.pedidos.find(x => x.id === data.id); const numero = `MIMO-${String(p.numero).padStart(6, '0')}-V${p.versao}-01`; s.propostas.push({ id: crypto.randomUUID(), pedido_id: p.id, numero, versao: p.versao, created_at: new Date().toISOString(), autor_id: USER, documento: p.documento }); return { numero }; },
  listarPropostasMimo: async ({ data }: any) => s.propostas.filter(x => x.pedido_id === data.id),
  arquivoPropostaMimo: async ({ data }: any) => { registrar('arquivo', data); const x = s.propostas.find(y => y.id === data.id); return { numero: x.numero, base64: btoa('%PDF-1.4 teste') }; },
  configurarTiraMimo: async () => { throw new Error('não usado'); },
}));

const { MimoTiraPage } = await import('@/components/mimo-tira-page');

function inicial(status: Pedido['status'] = 'rascunho'): Pedido {
  const m = MODELOS.find(x => x.nome.includes('Inicial'))!;
  let p: Pedido = { ...novoPedido(), leadId: LEAD, cliente: 'Cliente Sintético', itens: carregarModelo(m, CATALOGO), status };
  p = { ...p, volumes: sugerirCaixas(p.itens).map(v => ({ ...v, confirmado: true })), destinoCep: '01001000', endereco: 'Endereço sintético', fretePagador: 'cliente' };
  return { ...p, cotacoes: [{ id: 'c1', modalidade: 'Manual', prazo: '3 dias', modo: 'remessa', valor: 3000, valoresVolumes: {}, oficial: true, assinatura: assinaturaFrete(p), registradaEm: '2026-10-30T16:00:00Z' }], cotacaoId: 'c1' } as Pedido;
}
function semear(status: PedidoSalvo['status'], extra: Partial<PedidoSalvo> = {}) { const doc = inicial(status); const p = { id: crypto.randomUUID(), numero: ++s.seq, versao: 1, empresa_id: 'e', lead_id: LEAD, documento: doc, pix: null, recebimentos: [], created_at: '2026-10-30T12:00:00Z', updated_at: '2026-10-30T12:00:00Z', status, ...totais(doc), ...extra }; s.pedidos.push(p); versionar(p, 'salvar'); return p; }
async function montar(papel: string) {
  s.papel = papel; const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Suspense fallback={<p>carregando</p>}><MimoTiraPage /></Suspense></QueryClientProvider>);
  await screen.findByRole('heading', { name: 'Tira-pedido MiMo' });
}
async function escolher(user: ReturnType<typeof userEvent.setup>, label: string, opcao: RegExp | string) { await user.click(screen.getByRole('combobox', { name: label })); await user.click(await screen.findByRole('option', { name: opcao })); }
async function abrirPedido(user: ReturnType<typeof userEvent.setup>, numero: number) { await user.click(await screen.findByRole('button', { name: new RegExp(`#${numero} ·`) })); await screen.findByRole('button', { name: /Salvar pedido/ }); }

beforeEach(() => {
  Object.assign(s, { pedidos: [], versoes: [], propostas: [], chamadas: [], seq: 0 });
  Element.prototype.hasPointerCapture ??= () => false; Element.prototype.releasePointerCapture ??= () => {}; Element.prototype.scrollIntoView ??= () => {};
  window.confirm = vi.fn(() => true);
  URL.createObjectURL = vi.fn(() => 'blob:teste'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Tira-pedido · interface com servidor simulado', () => {
  it('vendedor cria pedido com PDV Inicial (R$ 968,75), salva e reabre na lista', async () => {
    const user = userEvent.setup(); await montar('vendedor');
    await user.click(screen.getByRole('button', { name: /Novo pedido/ }));
    await escolher(user, 'Cliente / lead *', 'Cliente Sintético');
    await escolher(user, 'Modelo de PDV', /PDV Inicial/);
    await user.click(screen.getByRole('button', { name: 'Carregar modelo' }));
    expect(screen.getAllByText(/968,75/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Salvar pedido/ }));
    await waitFor(() => expect(s.chamadas.some(c => c.fn === 'salvar')).toBe(true));
    const salvo = s.chamadas.find(c => c.fn === 'salvar')!.data;
    expect(salvo.versao).toBe(0); expect(salvo.pedido.leadId).toBe(LEAD); expect(salvo.pedido.itens.length).toBe(12);
    expect(calcularPedido(salvo.pedido).total).toBe(96875);
    await abrirPedido(user, 1);
    expect(screen.getByText(/Somente administrador ou gestor|restritos à gestão/)).toBeTruthy();
  });

  it('vendedor não consegue faturar, enviar, entregar, cancelar nem confirmar recebimento', async () => {
    semear('confirmado'); const user = userEvent.setup(); await montar('vendedor'); await abrirPedido(user, 1);
    for (const nome of ['Faturar', 'Cancelar']) expect((screen.getByRole('button', { name: nome }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Pagamento' }));
    expect((await screen.findByRole('button', { name: /Confirmar pagamento PIX/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(s.chamadas.filter(c => c.fn === 'status' || c.fn === 'receber')).toHaveLength(0);
  });

  it('gestor: PIX pendente bloqueia faturamento; após confirmar PIX fatura, envia e entrega', async () => {
    const p = semear('confirmado'); const user = userEvent.setup(); await montar('gestor'); await abrirPedido(user, 1);
    await user.click(screen.getByRole('button', { name: 'Faturar' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByRole('alert').textContent).toMatch(/PIX/);
    expect((within(dlg).getByRole('button', { name: /Confirmar ação/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');
    // Recebimento PIX simulado direto no servidor falso (o campo de valor é validado nos testes de regras).
    p.pix = { operacao: 'x', valor: p.total, usuarioId: USER, confirmadoEm: new Date().toISOString() }; p.recebimentos = [p.pix];
    await user.click(screen.getByRole('button', { name: /Voltar aos pedidos/ })); await abrirPedido(user, 1);
    for (const destino of ['Faturar', 'Enviar', 'Entregar']) {
      await user.click(screen.getByRole('button', { name: destino }));
      const d = await screen.findByRole('dialog'); await user.click(within(d).getByRole('button', { name: /Confirmar ação/ }));
      await waitFor(() => expect(s.chamadas.filter(c => c.fn === 'status')).toHaveLength(['Faturar', 'Enviar', 'Entregar'].indexOf(destino) + 1));
      await abrirPedido(user, 1);
    }
    expect(s.chamadas.filter(c => c.fn === 'status').map(c => c.data.status)).toEqual(['faturado', 'enviado', 'entregue']);
    expect(s.chamadas.find(c => c.data.status === 'faturado')!.data.faturadoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gestor cancela somente com motivo de pelo menos 5 caracteres', async () => {
    semear('rascunho'); const user = userEvent.setup(); await montar('gestor'); await abrirPedido(user, 1);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    const d = await screen.findByRole('dialog');
    await user.type(within(d).getByLabelText('Motivo do cancelamento'), 'abc');
    await user.click(within(d).getByRole('button', { name: /Confirmar ação/ }));
    expect((await within(d).findByRole('alert')).textContent).toMatch(/mínimo 5/);
    expect(s.chamadas.filter(c => c.fn === 'status')).toHaveLength(0);
    await user.type(within(d).getByLabelText('Motivo do cancelamento'), ' cliente desistiu');
    await user.click(within(d).getByRole('button', { name: /Confirmar ação/ }));
    await waitFor(() => expect(s.chamadas.find(c => c.fn === 'status')?.data).toMatchObject({ status: 'cancelado', motivo: 'abc cliente desistiu' }));
  });

  it('histórico compara versões e restaura criando nova versão', async () => {
    const p = semear('rascunho'); p.documento = { ...p.documento, observacoes: 'segunda' }; p.versao = 2; versionar(p, 'salvar');
    const user = userEvent.setup(); await montar('vendedor'); await abrirPedido(user, 1);
    await user.click(screen.getByRole('tab', { name: 'Histórico' }));
    await escolher(user, 'Comparar versão anterior', 'Versão 1'); await escolher(user, 'Com versão posterior', 'Versão 2');
    expect(screen.getByRole('columnheader', { name: 'Versão 1' })).toBeTruthy();
    const restaurar = screen.getAllByRole('button', { name: /Restaurar como nova versão/ });
    expect((restaurar[0] as HTMLButtonElement).disabled).toBe(true); // versão atual
    await user.click(restaurar[1]);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Criar nova versão/ }));
    await waitFor(() => expect(s.chamadas.find(c => c.fn === 'restaurar')?.data).toEqual({ id: p.id, versaoAtual: 2, versaoOrigem: 1 }));
  });

  it('emite proposta da versão salva, lista e baixa o arquivo arquivado', async () => {
    semear('rascunho'); const user = userEvent.setup(); await montar('vendedor'); await abrirPedido(user, 1);
    await user.click(screen.getByRole('tab', { name: 'Proposta' }));
    await user.click(screen.getByRole('button', { name: /Emitir proposta da versão salva/ }));
    expect(await screen.findByText('MIMO-000001-V1-01')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Baixar MIMO-000001-V1-01' }));
    await waitFor(() => expect(s.chamadas.some(c => c.fn === 'arquivo')).toBe(true));
    expect(JSON.stringify(s.propostas[0].documento)).not.toMatch(/"custoInterno":\d/);
  });

  it('lista filtra por status, pagina e indicadores não contam cancelados', async () => {
    for (let i = 0; i < 27; i++) semear('confirmado'); semear('cancelado');
    const user = userEvent.setup(); await montar('administrador');
    expect(await screen.findByText(/Página 1 de 2 · 28 pedidos/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText(/Página 2 de 2/)).toBeTruthy();
    await escolher(user, 'Filtrar status', 'Cancelado');
    expect(await screen.findByText(/Página 1 de 1 · 1 pedidos/)).toBeTruthy();
    expect(s.chamadas.filter(c => c.fn === 'listar').at(-1)!.data).toMatchObject({ status: 'cancelado', pagina: 1 });
    const ind = (rotulo: string) => screen.getByText(rotulo).closest('div')!.querySelector('strong')!.textContent;
    await waitFor(() => expect(ind('Confirmados')).toBe('0'));
    expect(ind('Receita cobrada')).toMatch(/0,00/);
  });
});
