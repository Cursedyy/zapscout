// @vitest-environment happy-dom
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MimoLeadsPage } from './mimo-leads-page';

const api = vi.hoisted(() => ({
  parametro: undefined as string | undefined,
  listar: vi.fn(), abrir: vi.fn(), followups: vi.fn(), mensagens: vi.fn(), enviar: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({ lead: api.parametro }) }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@/lib/mimo-leads.functions', () => ({
  contextoLeadsMimo: async () => ({ usuarioId: 'equipe-teste', papel: 'vendedor', membros: [] }),
  listarLeadsMimo: api.listar,
}));
vi.mock('@/lib/mimo-comercial.functions', () => ({
  abrirLeadComercialMimo: api.abrir,
  followupsMimo: api.followups,
  alterarFollowupMimo: vi.fn(),
}));
vi.mock('@/lib/mimo-whatsapp.functions', () => ({
  mensagensLeadWhatsAppMimo: api.mensagens,
  enviarMensagemLeadMimo: api.enviar,
}));
vi.mock('./mimo-lead-editor', () => ({
  Escolha: () => null,
  MimoLeadEditor: ({ abaInicial }: { abaInicial?: string }) => <div role="dialog">{abaInicial}</div>,
}));

const primeiro = {
  id: 'lead-1', nome_empresa: 'Empório Teste', nome_contato: 'Cliente A', telefone: '5500000000001',
  etapa: 'novo', qualificacao: 'qualificado', perfil: 'emporio', origem: 'whatsapp',
  responsavel_id: null, observacoes: 'Quer consultar o mix.', ultimo_contato_whatsapp_em: null, orcamento_estimado: null,
};
const segundo = { ...primeiro, id: 'lead-2', nome_empresa: 'Mercado Teste', nome_contato: 'Cliente B',
  telefone: '5500000000002', etapa: 'em_negociacao', observacoes: 'Já recebeu o catálogo.' };
const foraDaPagina = { ...primeiro, id: 'lead-3', nome_empresa: 'Loja Teste', nome_contato: 'Cliente C', telefone: '5500000000003' };
let client: QueryClient;

function montar() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Suspense fallback={null}><MimoLeadsPage /></Suspense></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  api.listar.mockResolvedValue({ leads: [primeiro, segundo], total: 32 });
  api.abrir.mockImplementation(async ({ data: { id } }) => [primeiro, segundo, foraDaPagina].find(lead => lead.id === id));
  api.mensagens.mockImplementation(async ({ data: { leadId } }) => ({ mais: false, mensagens: [{
    id: leadId, texto: `Mensagem de ${leadId}`, direcao: 'recebida', contato_em: '2026-11-23T13:00:00Z',
  }] }));
  api.followups.mockResolvedValue({ disponivel: true, historico: [], itens: [{
    id: 'retorno', lead_id: foraDaPagina.id, observacao: 'Ligar para confirmar o pedido', responsavel_id: 'equipe-teste',
    estado: 'pendente', prazo: '2099-11-23T13:00:00Z',
  }] });
});

afterEach(() => {
  cleanup();
  client?.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  api.parametro = undefined;
});

it('troca a visualização, mantém o lead selecionado e nunca reaproveita a conversa de outro contato', async () => {
  montar();
  fireEvent.click(await screen.findByRole('button', { name: /Empório Teste/ }));
  expect(await screen.findByText('Mensagem de lead-1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Resposta rápida' }));

  fireEvent.click(screen.getByRole('button', { name: 'Funil comercial' }));
  expect(screen.getByText('Mensagem de lead-1')).toBeTruthy();
  expect(screen.getByLabelText<HTMLTextAreaElement>('Sua mensagem').value).toContain('primeiro pedido');
  fireEvent.click(screen.getByRole('button', { name: 'Fila de retornos' }));
  expect(await screen.findByText('Mensagem de lead-1')).toBeTruthy();
  expect(screen.getByLabelText<HTMLTextAreaElement>('Sua mensagem').value).toContain('primeiro pedido');
  fireEvent.click(screen.getByRole('button', { name: 'Funil comercial' }));
  const etapa = screen.getByRole('region', { name: 'Em negociação' });
  fireEvent.click(within(etapa).getByRole('button', { name: /Mercado Teste/ }));
  expect(await screen.findByText('Mensagem de lead-2')).toBeTruthy();
  expect(screen.queryByText('Mensagem de lead-1')).toBeNull();
  expect(screen.getByLabelText<HTMLTextAreaElement>('Sua mensagem').value).toBe('');
  expect(api.enviar).not.toHaveBeenCalled();
});

it('abre um retorno cujo lead está fora da página de resultados com a consulta autorizada', async () => {
  montar();
  await screen.findByRole('button', { name: /Empório Teste/ });
  fireEvent.click(screen.getByRole('button', { name: 'Fila de retornos' }));
  fireEvent.click(await screen.findByRole('button', { name: /Ligar para confirmar/ }));
  expect(await screen.findByText('Mensagem de lead-3')).toBeTruthy();
  expect(api.abrir).toHaveBeenCalledWith(expect.objectContaining({ data: { id: foraDaPagina.id } }));
  fireEvent.click(screen.getByRole('button', { name: /^Follow-ups$/ }));
  expect(screen.getByRole('dialog').textContent).toBe('followups');
});

it('abre o chat a partir do link da fila de leads', async () => {
  api.parametro = foraDaPagina.id;
  montar();
  expect(await screen.findByText('Mensagem de lead-3')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Cliente C' })).toBeTruthy();
});
