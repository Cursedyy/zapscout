// @vitest-environment happy-dom
// Servidores simulados: nenhuma gravação, importação ou mensagem real.
import { Suspense } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { calcularDashboard } from '@/lib/mimo-dashboard';
import { calcularRelatorio } from '@/lib/mimo-relatorio';
import { periodoInicialMimo } from '@/lib/mimo-periodo';

const s = vi.hoisted(() => ({ dashboard: vi.fn(), relatorio: vi.fn(), equipe: vi.fn(), convite: vi.fn(), ativo: vi.fn(), transferir: vi.fn(), perdas: vi.fn(), contexto: vi.fn(), leads: vi.fn(), meta: vi.fn(), importar: vi.fn(), estado: vi.fn(), conectar: vi.fn(), ativar: vi.fn(), pausar: vi.fn(), mensagens: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (f: unknown) => f }));
vi.mock('@/lib/mimo-dashboard.functions', () => ({ dashboardMimo: s.dashboard }));
vi.mock('@/lib/mimo-relatorio.functions', () => ({ relatorioMimo: s.relatorio }));
vi.mock('@/lib/mimo-equipe.functions', () => ({ listarEquipeMimo: s.equipe, convidarMembroMimo: s.convite, definirAtivoMimo: s.ativo, alterarPapelMimo: vi.fn(), reatribuirLeadsMimo: s.transferir }));
vi.mock('@/lib/mimo-leads.functions', () => ({ contextoLeadsMimo: s.contexto, listarLeadsMimo: s.leads, perdasMimo: s.perdas, gravarLeadMimo: vi.fn(), historicoLeadMimo: vi.fn(async () => []), verificarDuplicadosMimo: vi.fn(async () => []) }));
vi.mock('@/lib/mimo-meta-ads.functions', () => ({ listarImportacoesMetaMimo: s.meta, importarMetaAdsMimo: s.importar }));
vi.mock('@/lib/mimo-whatsapp.functions', () => ({ estadoWhatsAppMimo: s.estado, conectarWhatsAppMimo: s.conectar, ativarWhatsAppMimo: s.ativar, pausarWhatsAppMimo: s.pausar, mensagensLeadWhatsAppMimo: s.mensagens }));
import { MimoDashboardPage } from './mimo-dashboard-page';
import { MimoRelatoriosPage } from './mimo-relatorios-page';
import { MimoEquipePage } from './mimo-equipe-page';
import { MimoPerdasPage } from './mimo-perdas-page';
import { MimoLeadsPage } from './mimo-leads-page';
import { MimoMetaAdsPage } from './mimo-meta-ads-page';
import { MimoWhatsAppPage } from './mimo-whatsapp-page';
import { WhatsAppLeadMimo } from './mimo-whatsapp-lead';
const U = '22222222-2222-4222-8222-222222222222';
const V = '33333333-3333-4333-8333-333333333333';
const estado = (extra = {}) => ({ disponivel: true, compativel: true, status: 'connected', numero: '5511999999999', desafio: 'desafio-simulado', erro: '', vinculos: [], ...extra });
function montar(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><Suspense fallback={<p>Carregando teste</p>}>{node}</Suspense></QueryClientProvider>);
  return qc;
}
beforeEach(() => {
  vi.clearAllMocks();
  s.dashboard.mockImplementation(async ({ data }) => ({ permitido: true, ...calcularDashboard(data, [], []) }));
  s.relatorio.mockImplementation(async ({ data }) => ({ permitido: true, ...calcularRelatorio(data, [], []) }));
  s.equipe.mockResolvedValue({ papel: 'administrador', usuarioId: U, auditoria: [], membros: [
    { user_id: U, nome: 'Gestão', email: 'gestao@example.test', papel: 'administrador', ativo: true, leads_atribuidos: 0 },
    { user_id: V, nome: 'Vendas', email: 'vendas@example.test', papel: 'vendedor', ativo: true, leads_atribuidos: 2 },
  ] });
  s.convite.mockResolvedValue('adicionado'); s.ativo.mockResolvedValue(undefined);
  s.perdas.mockResolvedValue({ papel: 'gestor', linhas: [] });
  s.contexto.mockResolvedValue({ empresaId: 'empresa', usuarioId: U, papel: 'gestor', membros: [] });
  s.leads.mockResolvedValue({ leads: [], total: 0 });
  s.meta.mockResolvedValue({ podeImportar: true, itens: [] });
  s.importar.mockResolvedValue({ novas: 1, atualizadas: 0 });
  s.estado.mockResolvedValue(estado());
  s.conectar.mockResolvedValue({ status: 'connecting', qrcode: 'data:image/png;base64,AAAA' });
  s.ativar.mockResolvedValue({ ativo: true }); s.pausar.mockResolvedValue({ ativo: false });
  s.mensagens.mockResolvedValue({ mensagens: [], mais: false });
});
afterEach(cleanup);

describe('Dashboard, relatórios e perdas', () => {
  it('dashboard apresenta os oito indicadores e o estado vazio', async () => {
    montar(<MimoDashboardPage />);
    expect(await screen.findByText('Ainda não há dados neste período')).toBeTruthy();
    expect(screen.getByText('Taxa de qualificação')).toBeTruthy(); expect(screen.getByText('Pedidos fechados')).toBeTruthy();
    expect(s.dashboard).toHaveBeenCalledWith({ data: periodoInicialMimo(30) });
  });
  it('dashboard bloqueia um período superior ao permitido antes de consultar', async () => {
    montar(<MimoDashboardPage />); await screen.findByText('Ainda não há dados neste período');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2020-01-01' } });
    expect(await screen.findByRole('alert')).toBeTruthy(); expect(s.dashboard).toHaveBeenCalledTimes(1);
  });
  it('relatórios não exportam dados antigos durante mudança de período', async () => {
    montar(<MimoRelatoriosPage />); const resumo = await screen.findByRole('button', { name: 'Resumo' });
    expect((resumo as HTMLButtonElement).disabled).toBe(false);
    let concluir!: (v: any) => void;
    s.relatorio.mockImplementationOnce(() => new Promise(resolve => { concluir = resolve; }));
    const f = periodoInicialMimo(7); const inicio = new Date(Date.parse(f.inicio) - 86400000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: inicio } });
    await screen.findByText(/Atualizando relatório/); expect((resumo as HTMLButtonElement).disabled).toBe(true);
    await act(async () => concluir({ permitido: true, ...calcularRelatorio({ ...f, inicio }, [], []) }));
    await waitFor(() => expect((resumo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2020-01-01' } });
    expect((resumo as HTMLButtonElement).disabled).toBe(true);
  });
  it('relatórios respeitam a resposta sem acesso', async () => {
    s.relatorio.mockResolvedValue({ permitido: false }); montar(<MimoRelatoriosPage />);
    expect(await screen.findByText(/Os relatórios gerais/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Resumo' })).toBeNull();
  });
  it('perdas preservam a tabela anterior enquanto o novo filtro carrega e rejeitam datas invertidas', async () => {
    s.perdas.mockResolvedValue({ papel: 'gestor', linhas: [{ motivo_perda_codigo: 'preco', responsavel_id: null }] });
    montar(<MimoPerdasPage />); await screen.findByText(/Geral/);
    s.perdas.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('Perdidos de'), { target: { value: '2026-11-01' } });
    await screen.findByText('Atualizando perdas…'); expect(screen.getByText(/Geral/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Perdidos até'), { target: { value: '2026-10-01' } });
    expect(await screen.findByRole('alert')).toBeTruthy(); expect(s.perdas).toHaveBeenCalledTimes(2);
  });
});

describe('Leads, equipe e Meta Ads', () => {
  it('leads consultam o filtro de pesquisa e abrem novo cadastro', async () => {
    montar(<MimoLeadsPage />); await screen.findByText('Nenhum lead encontrado'); const u = userEvent.setup();
    await u.type(screen.getByLabelText('Pesquisar leads'), 'Empório'); await u.click(screen.getByRole('button', { name: /^Pesquisar$/ }));
    await waitFor(() => expect(s.leads).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ busca: 'Empório', pagina: 0 }) })));
    await u.click(screen.getByRole('button', { name: 'Novo lead' })); expect(await screen.findByRole('dialog')).toBeTruthy();
  });
  it('equipe só desativa um membro após confirmação', async () => {
    montar(<MimoEquipePage />); const u = userEvent.setup(); await u.click(await screen.findByRole('button', { name: 'Desativar' }));
    expect(s.ativo).not.toHaveBeenCalled(); await u.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(s.ativo).toHaveBeenCalledWith({ data: { userId: V, ativo: false } }));
  });
  it('falha de conexão da equipe oferece nova tentativa', async () => {
    s.equipe.mockRejectedValueOnce(new Error('rede')); montar(<MimoEquipePage />);
    await screen.findByRole('alert'); await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Membros')).toBeTruthy();
  });
  it('gestor consulta membros sem oferecer convite administrativo', async () => {
    const d = await s.equipe(); s.equipe.mockResolvedValue({ ...d, papel: 'gestor' }); montar(<MimoEquipePage />);
    await screen.findByText('Membros'); expect(screen.queryByRole('button', { name: 'Adicionar' })).toBeNull();
  });
  it('Meta Ads mostra histórico sem oferecer importação a quem não pode importar', async () => {
    s.meta.mockResolvedValue({ podeImportar: false, itens: [] }); montar(<MimoMetaAdsPage />);
    await screen.findByText('Nenhuma importação ainda.'); expect(screen.queryByText('Escolher arquivo CSV')).toBeNull();
  });
  it('erro na leitura de CSV aparece na tela sem tentar importar', async () => {
    montar(<MimoMetaAdsPage />); await screen.findByText('Escolher arquivo CSV');
    const file = new File(['x'], 'meta.csv', { type: 'text/csv' }); Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('leitura')) });
    fireEvent.change(document.querySelector('#csv-meta')!, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Não foi possível ler'));
    expect(s.importar).not.toHaveBeenCalled();
  });
  it('trocar rapidamente de CSV preserva a última seleção e só importa após confirmação', async () => {
    montar(<MimoMetaAdsPage />); await screen.findByText('Escolher arquivo CSV');
    const csv = 'Campaign name,Reporting starts,Reporting ends,Amount spent (BRL),Leads\nRevenda,2026-10-01,2026-10-07,50,4';
    let terminar!: (v: string) => void;
    const antigo = new File([''], 'antigo.csv', { type: 'text/csv' });
    Object.defineProperty(antigo, 'text', { value: () => new Promise<string>(r => { terminar = r; }) });
    const novo = new File([csv], 'novo.csv', { type: 'text/csv' });
    Object.defineProperty(novo, 'text', { value: async () => csv });
    const input = document.querySelector('#csv-meta')!;
    fireEvent.change(input, { target: { files: [antigo] } });
    fireEvent.change(input, { target: { files: [novo] } });
    await screen.findByText('Prévia: novo.csv');
    await act(async () => terminar(csv));
    expect(screen.queryByText('Prévia: antigo.csv')).toBeNull(); expect(s.importar).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() => expect(s.importar).toHaveBeenCalledWith({ data: { nome: 'novo.csv', texto: csv } }));
  });
});

describe('WhatsApp comercial', () => {
  it('ativação exige confirmação explícita do número conectado', async () => {
    montar(<MimoWhatsAppPage />); const b = await screen.findByRole('button', { name: 'Ativar leads automáticos' });
    expect((b as HTMLButtonElement).disabled).toBe(true); const u = userEvent.setup();
    await u.click(screen.getByRole('checkbox')); await u.click(b);
    await waitFor(() => expect(s.ativar).toHaveBeenCalledWith({ data: { numero: '5511999999999', desafio: 'desafio-simulado', confirmado: true } }));
  });
  it('pareamento é disparado só pelo botão e apresenta QR Code', async () => {
    s.estado.mockResolvedValue(estado({ status: 'disconnected', numero: null })); montar(<MimoWhatsAppPage />);
    const b = await screen.findByRole('button', { name: 'Conectar WhatsApp' }); expect(s.conectar).not.toHaveBeenCalled();
    await userEvent.setup().click(b); expect(await screen.findByAltText('QR Code para conectar o WhatsApp comercial')).toBeTruthy();
  });
  it('mensagens do lead paginam e oferecem atalho manual', async () => {
    s.mensagens.mockResolvedValue({ mensagens: [{ id: '1', texto: 'Contato recebido', direcao: 'recebida', contato_em: '2026-11-01T12:00:00Z' }], mais: true });
    montar(<WhatsAppLeadMimo leadId={V} usuarioId={U} telefone="5511999999999" />); await screen.findByText('Contato recebido');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mais antigas' }));
    await waitFor(() => expect(s.mensagens).toHaveBeenLastCalledWith({ data: { leadId: V, pagina: 1 } }));
    expect((screen.getByRole('link', { name: 'Abrir WhatsApp' }) as HTMLAnchorElement).href).toContain('wa.me');
  });
});
