// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CATALOGO, itemDeProduto, novoPedido, type ItemPedido, type Pedido } from '@/lib/mimo-pedido';
import { LogisticaPedido } from './mimo-pedido-logistica';
import { TabelaProdutosPedido } from './mimo-pedido-itens';
import { CadastrosTira } from './mimo-tira-cadastros';
import { CAIXAS_PADRAO, type Brinde } from '@/lib/mimo-tira-regras';

vi.mock('@tanstack/react-start', () => {
  const chain: { middleware: () => unknown; inputValidator: () => unknown; handler: () => unknown } = {
    middleware: () => chain, inputValidator: () => chain, handler: () => vi.fn(),
  };
  return { useServerFn: (fn: unknown) => fn, createServerFn: () => chain };
});
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/lib/mimo-frete.functions', () => ({ cotarFreteMimo: vi.fn(), confirmarOrigemFreteMimo: vi.fn() }));

const produto = CATALOGO.find(p => p.codigo === 'M001');
if (!produto) throw new Error('Produto sintético obrigatório ausente.');
const externo: ItemPedido = {
  id: 'ext', codigo: '', nome: 'Brinde externo sintético', unidade: 'Unidade', tipo: 'outro', quantidade: 2,
  precoOriginal: 0, precoNegociado: 0, desconto: { modo: 'percentual', valor: 0 }, brinde: true,
  custoInterno: null, pesoG: null, envioSeparado: true,
};
const brinde: Brinde = { id: 'b1', nome: 'Brinde cadastrado sintético', unidade: 'Unidade', pesoG: null, custoInterno: null, ativo: true, envioSeparado: true };

function renderLogistica(p: Pedido) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><LogisticaPedido pedido={p} caixas={CAIXAS_PADRAO} onChange={vi.fn()} avisar={vi.fn()} usuarioId="usuario-sintetico" /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('interface de envio separado', () => {
  it('mantém nome e quantidade no pedido e remove brinde externo dos volumes antigos', async () => {
    const comum = itemDeProduto(produto, 2);
    const p: Pedido = {
      ...novoPedido(), itens: [comum, externo],
      volumes: [
        { id: 'misto', caixa: 'P', conteudo: [{ itemId: comum.id, quantidade: 2 }, { itemId: externo.id, quantidade: 2 }], pesoAjustadoG: 9000, confirmado: true },
        { id: 'so-brinde', caixa: 'G', conteudo: [{ itemId: externo.id, quantidade: 2 }], pesoAjustadoG: null, confirmado: false },
      ],
    };
    renderLogistica(p);
    const separados = screen.getByRole('region', { name: 'Brindes com envio separado' });
    expect(within(separados).getByText(/Brinde externo sintético/).textContent).toContain('× 2');
    const caixas = screen.getByText(/Conferir ou ajustar caixas/).closest('details')!;
    expect(within(caixas).getByText('Volume 1')).toBeTruthy();
    expect(within(caixas).queryByText('Volume 2')).toBeNull();
    expect(within(caixas).queryByText(/Brinde externo sintético/)).toBeNull();
    expect(within(caixas).getByText(comum.nome)).toBeTruthy();

    cleanup();
    render(<TabelaProdutosPedido catalogo={CATALOGO} itens={[externo]} totalProdutos={0} editavel podeVerCustoBrinde={false} onAlterarItens={vi.fn()} onAdicionarProduto={vi.fn()} />);
    const linha = screen.getByText(externo.nome).closest('tr')!;
    expect(within(linha).getByText(/Envio separado/)).toBeTruthy();
    expect((within(linha).getByRole('textbox', { name: `Quantidade de ${externo.nome}` }) as HTMLInputElement).value).toBe('2');
    await userEvent.setup().click(within(linha).getByRole('button', { name: `Ajustar ${externo.nome}` }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/não entra em caixas, pesos/)).toBeTruthy();
    expect(within(dialog).queryByLabelText('Peso unitário do brinde (g)')).toBeNull();
  });

  it('pedido somente separado não mostra caixas, pesos, cotação ou pagador', () => {
    renderLogistica({ ...novoPedido(), itens: [externo] });
    expect(screen.getByText('Nenhuma caixa na remessa principal', { exact: false })).toBeTruthy();
    expect(screen.queryByText(/Conferir ou ajustar caixas/)).toBeNull();
    expect(screen.queryByLabelText(/Peso total ajustado/)).toBeNull();
    expect(screen.queryByText('Frete e transportadoras')).toBeNull();
    expect(screen.queryByText('Responsável pelo frete *')).toBeNull();
    expect(screen.getByText(/não tem remessa principal para cotar/)).toBeTruthy();
  });

  it('cadastro reutilizável tem opção explícita e compatível com registros antigos', async () => {
    render(<CadastrosTira area="brindes" papel="gestor" brindes={[brinde]} caixas={CAIXAS_PADRAO} onBrindes={vi.fn()} onCaixas={vi.fn()} />);
    expect(screen.getByText('Envio separado')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: `Editar brinde ${brinde.nome}` }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByRole('checkbox', { name: /Envio separado \(fora das caixas/ }) as HTMLInputElement).checked).toBe(true);
  });
});
