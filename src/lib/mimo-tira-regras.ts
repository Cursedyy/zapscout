import { z } from 'zod';
import { assinaturaFrete, calcularPedido, CAIXAS, pendenciasPedido, STATUS, type Pedido, type PedidoSalvo, type Produto, type Recebimento, type StatusPedido } from '@/lib/mimo-pedido';

// Pure lifecycle, permission and snapshot rules shared by UI, server functions and tests.
// The prepared SQL repeats the same matrix so the database never relies on the UI.
export type Papel = 'administrador' | 'gestor' | 'vendedor';
export const GESTAO: readonly Papel[] = ['administrador', 'gestor'];
export const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  rascunho: ['aguardando_pagamento', 'confirmado', 'cancelado'],
  aguardando_pagamento: ['rascunho', 'confirmado', 'cancelado'],
  confirmado: ['rascunho', 'aguardando_pagamento', 'faturado', 'cancelado'],
  faturado: ['enviado', 'cancelado'],
  enviado: ['entregue'],
  entregue: [],
  cancelado: [],
};
export const SOMENTE_GESTAO: StatusPedido[] = ['faturado', 'enviado', 'entregue', 'cancelado'];
export const EDITAVEIS: StatusPedido[] = ['rascunho', 'aguardando_pagamento', 'confirmado'];
export const ehGestao = (papel: string) => (GESTAO as readonly string[]).includes(papel);
export const podeEditarComercial = (status: StatusPedido) => EDITAVEIS.includes(status);

export function erroTransicao(papel: string, de: StatusPedido, para: StatusPedido, pedido: Pedido, pix: Recebimento): string | null {
  if (de === para) return 'O pedido já está neste estado.';
  if (!TRANSICOES[de].includes(para)) return `Não é permitido passar de ${STATUS[de]} para ${STATUS[para]}.`;
  if (SOMENTE_GESTAO.includes(para) && !ehGestao(papel)) return `Somente administrador ou gestor pode marcar ${STATUS[para]}.`;
  if (para === 'cancelado' || para === 'rascunho') return null;
  if (['faturado', 'enviado', 'entregue'].includes(para)) {
    if (pedido.pagamento.forma === 'pix' && !pix) return 'Confirme o recebimento PIX antes de faturar ou enviar.';
    if (!pedido.pagamento.faturadoEm) return 'Registre a data de faturamento.';
  }
  const pend = pendenciasPedido({ ...pedido, status: para }, pix);
  return pend[0] ?? null;
}
export function opcoesStatus(papel: string, atual: StatusPedido) {
  return TRANSICOES[atual].filter(s => s !== 'cancelado' && (!SOMENTE_GESTAO.includes(s) || ehGestao(papel)));
}
export function podeCancelar(papel: string, status: StatusPedido) { return ehGestao(papel) && TRANSICOES[status].includes('cancelado'); }
export const motivoCancelamentoSchema = z.string().trim().min(5, 'Informe o motivo do cancelamento (mínimo 5 caracteres).').max(1000);
export function podeConfirmarRecebimento(papel: string, status: StatusPedido) { return ehGestao(papel) && !['cancelado', 'entregue'].includes(status); }

// Saving commercial content never changes operational state outside the editable states.
export function erroSalvar(papel: string, anterior: StatusPedido | null, novo: Pedido): string | null {
  if (anterior && !podeEditarComercial(anterior)) return `Pedido ${STATUS[anterior]}: valores comerciais bloqueados.`;
  if (!EDITAVEIS.includes(novo.status)) return 'Use as ações de status para faturar, enviar, entregar ou cancelar.';
  if (anterior && anterior !== novo.status && !TRANSICOES[anterior].includes(novo.status)) return 'Mudança de estado não permitida.';
  void papel; return null;
}

export type Diferenca = { campo: string; antes: string; depois: string };
const brl = (v: number) => (v / 100).toFixed(2).replace('.', ',');
export function compararVersoes(a: Pedido, b: Pedido): Diferenca[] {
  const d: Diferenca[] = []; const add = (campo: string, x: unknown, y: unknown) => { const s1 = String(x ?? '—'), s2 = String(y ?? '—'); if (s1 !== s2) d.push({ campo, antes: s1, depois: s2 }); };
  add('Status', STATUS[a.status], STATUS[b.status]);
  let ta = '—', tb = '—'; try { ta = brl(calcularPedido(a).total); } catch { /* inválido */ } try { tb = brl(calcularPedido(b).total); } catch { /* inválido */ }
  add('Total (R$)', ta, tb); add('Forma de pagamento', a.pagamento.forma, b.pagamento.forma); add('Parcelas', a.pagamento.parcelas, b.pagamento.parcelas);
  add('Frete pago por', a.fretePagador, b.fretePagador); add('Cotação escolhida', a.cotacaoId, b.cotacaoId); add('Desconto geral', `${a.descontoGeral.modo}:${a.descontoGeral.valor}`, `${b.descontoGeral.modo}:${b.descontoGeral.valor}`);
  const ia = new Map(a.itens.map(i => [i.id, i])), ib = new Map(b.itens.map(i => [i.id, i]));
  for (const [id, i] of ia) { const j = ib.get(id); if (!j) d.push({ campo: `Item ${i.nome}`, antes: `${i.quantidade} un.`, depois: 'removido' }); else { add(`${i.nome} · quantidade`, i.quantidade, j.quantidade); add(`${i.nome} · preço negociado`, brl(i.precoNegociado), brl(j.precoNegociado)); add(`${i.nome} · desconto`, `${i.desconto.modo}:${i.desconto.valor}`, `${j.desconto.modo}:${j.desconto.valor}`); } }
  for (const [id, j] of ib) if (!ia.has(id)) d.push({ campo: `Item ${j.nome}`, antes: 'ausente', depois: `${j.quantidade} un.` });
  return d;
}
// Restoring builds a new document from an old one, keeping the current state; a stale
// freight quote is detected by signature and must be refreshed before confirming.
export function restaurarVersao(statusAtual: StatusPedido, antigo: Pedido) {
  if (!podeEditarComercial(statusAtual)) throw new Error(`Pedido ${STATUS[statusAtual]}: restauração bloqueada.`);
  const documento: Pedido = { ...structuredClone(antigo), status: statusAtual === 'confirmado' ? 'rascunho' : statusAtual };
  calcularPedido(documento);
  const cotacao = documento.cotacoes.find(c => c.id === documento.cotacaoId);
  return { documento, refazerFrete: !cotacao || cotacao.assinatura !== assinaturaFrete(documento) };
}

// Reusable gift catalog; internal cost never reaches client-facing output.
export const brindeSchema = z.object({ id: z.string().min(1).max(80), nome: z.string().trim().min(2).max(200), unidade: z.string().trim().min(1).max(80), pesoG: z.number().int().min(1).max(100_000).nullable(), custoInterno: z.number().int().min(0).max(100_000_000).nullable(), ativo: z.boolean() });
export type Brinde = z.infer<typeof brindeSchema>;
export function itemDeBrinde(b: Brinde, quantidade = 1) {
  if (!b.ativo) throw new Error('Brinde inativo.');
  return { id: crypto.randomUUID(), codigo: `BR:${b.id}`, nome: b.nome, unidade: b.unidade, tipo: 'outro' as const, quantidade, precoOriginal: 0, precoNegociado: 0, desconto: { modo: 'percentual' as const, valor: 0 }, brinde: true, custoInterno: b.custoInterno, pesoG: b.pesoG };
}
export const caixaTipoSchema = z.object({ id: z.string().regex(/^[A-Z0-9]{1,4}$/), nome: z.string().trim().min(2).max(60), dimensoes: z.tuple([z.number().int().min(1).max(200), z.number().int().min(1).max(200), z.number().int().min(1).max(200)]), displays: z.number().int().min(0).max(100), misturinhas: z.number().int().min(0).max(200), ativo: z.boolean() });
export type CaixaTipo = z.infer<typeof caixaTipoSchema>;
export const CAIXAS_PADRAO: CaixaTipo[] = (['P', 'G'] as const).map(id => ({ id, nome: CAIXAS[id].nome, dimensoes: [...CAIXAS[id].dimensoes] as [number, number, number], displays: CAIXAS[id].displays, misturinhas: CAIXAS[id].misturinhas, ativo: true }));

export type MudancaPreco = { codigo: string; antes: number | null; depois: number | null };
export function mudancasPreco(antes: Produto[], depois: Produto[]): MudancaPreco[] {
  const m = new Map(antes.map(p => [p.codigo, p.preco]));
  return depois.filter(p => !m.has(p.codigo) || m.get(p.codigo) !== p.preco).map(p => ({ codigo: p.codigo, antes: m.get(p.codigo) ?? null, depois: p.preco }));
}
export function erroCatalogo(antes: Produto[], depois: Produto[]): string | null {
  if (new Set(depois.map(p => p.codigo)).size !== depois.length) return 'Código de produto repetido.';
  const removidos = antes.filter(p => !depois.some(d => d.codigo === p.codigo));
  if (removidos.length) return 'Produtos não são excluídos; desative em vez de remover.';
  return null;
}

// Proposals: numbered per order version, emitted from an immutable client-safe snapshot.
export function numeroProposta(numeroPedido: number, versao: number, sequencia: number) { return `MIMO-${String(numeroPedido).padStart(6, '0')}-V${versao}-${String(sequencia).padStart(2, '0')}`; }
export function snapshotCliente(p: Pedido): Pedido { return { ...structuredClone(p), itens: p.itens.map(i => ({ ...i, custoInterno: null })), responsavelId: null }; }
export function podeVerProposta(papel: string, usuarioId: string, responsavelPedido: string | null) { return ehGestao(papel) || (papel === 'vendedor' && usuarioId === responsavelPedido); }

export const ORDENS = { atualizado_desc: ['updated_at', false], atualizado_asc: ['updated_at', true], numero_desc: ['numero', false], numero_asc: ['numero', true], total_desc: ['total', false], total_asc: ['total', true] } as const;
export const filtroPedidosSchema = z.object({
  pagina: z.number().int().min(1).max(100_000).default(1), porPagina: z.number().int().min(10).max(100).default(25),
  status: z.enum(['rascunho', 'aguardando_pagamento', 'confirmado', 'faturado', 'enviado', 'entregue', 'cancelado']).nullable().default(null),
  busca: z.string().trim().max(100).default(''), inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null), fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  ordem: z.enum(Object.keys(ORDENS) as [keyof typeof ORDENS, ...Array<keyof typeof ORDENS>]).default('atualizado_desc'),
});
export type FiltroPedidos = z.infer<typeof filtroPedidosSchema>;
export function intervalo(f: FiltroPedidos) { const de = (f.pagina - 1) * f.porPagina; return { de, ate: de + f.porPagina - 1 }; }
export function buscaSegura(t: string) { return t.replace(/[%_,().*\\]/g, ' ').trim(); }
export function totalPaginas(total: number, porPagina: number) { return Math.max(1, Math.ceil(total / porPagina)); }

// Indicators count one row per order (latest state), so editing or reopening never duplicates.
export function indicadoresTira(pedidos: PedidoSalvo[]) {
  const ultimo = new Map<string, PedidoSalvo>(); for (const p of pedidos) { const x = ultimo.get(p.id); if (!x || x.versao < p.versao) ultimo.set(p.id, p); }
  const lista = [...ultimo.values()]; const ativos = lista.filter(p => p.status !== 'cancelado'); const conf = ativos.filter(p => ['confirmado', 'faturado', 'enviado', 'entregue'].includes(p.status));
  const fat = ativos.filter(p => ['faturado', 'enviado', 'entregue'].includes(p.status));
  const bon = (l: PedidoSalvo[]) => l.reduce((s, p) => { try { return s + calcularPedido(p.documento).bonificacoes; } catch { return s; } }, 0);
  return { confirmados: conf.length, faturados: fat.length, cancelados: lista.length - ativos.length, valorConfirmado: conf.reduce((s, p) => s + p.total, 0), valorFaturado: fat.reduce((s, p) => s + p.total, 0), fretes: conf.reduce((s, p) => s + p.frete, 0), bonificacoes: bon(conf), recebidos: ativos.reduce((s, p) => s + p.recebimentos.reduce((a, r) => a + (r?.valor ?? 0), 0), 0) };
}
// Redaction is applied at the server boundary as well as in safe database views.
export function documentoPorPapel(p: Pedido, papel: string): Pedido {
  return ehGestao(papel) ? p : { ...p, itens: p.itens.map(i => ({ ...i, custoInterno: null })) };
}
export function brindesPorPapel(brindes: Brinde[], papel: string): Brinde[] {
  return ehGestao(papel) ? brindes : brindes.map(b => ({ ...b, custoInterno: null }));
}
export function prepararDocumento(p: Pedido, papel: string, catalogo: Produto[], brindes: Brinde[], taxas: number[], anterior: Pedido | null): Pedido {
  const itens = p.itens.map(i => {
    if (!ehGestao(papel) && i.custoInterno !== null) throw new Error('Custo interno restrito à gestão.');
    const velho = anterior?.itens.find(x => x.id === i.id && x.codigo === i.codigo && x.brinde === i.brinde);
    if (velho) return { ...i, nome: velho.nome, unidade: velho.unidade, tipo: velho.tipo, pesoG: velho.pesoG, precoOriginal: velho.precoOriginal, custoInterno: ehGestao(papel) ? i.custoInterno : velho.custoInterno };
    if (i.codigo.startsWith('BR:')) {
      const b = brindes.find(b => b.id === i.codigo.slice(3) && b.ativo);
      if (!b || !i.brinde) throw new Error('Brinde indisponível.');
      return { ...i, nome: b.nome, unidade: b.unidade, pesoG: b.pesoG, tipo: 'outro' as const, precoOriginal: 0, precoNegociado: 0, custoInterno: b.custoInterno };
    }
    if (!i.codigo && i.brinde) return { ...i, precoOriginal: 0, precoNegociado: 0, custoInterno: ehGestao(papel) ? i.custoInterno : null };
    const produto = catalogo.find(x => x.codigo === i.codigo && x.ativo);
    if (!produto || produto.preco === null || produto.pesoG === null) throw new Error('Produto sem dados comerciais autorizados.');
    return { ...i, nome: produto.nome, unidade: produto.unidade, tipo: produto.tipo, pesoG: produto.pesoG, precoOriginal: produto.preco, custoInterno: ehGestao(papel) ? i.custoInterno : null };
  });
  const historica = anterior && anterior.pagamento.forma === p.pagamento.forma && anterior.pagamento.parcelas === p.pagamento.parcelas;
  const taxa = historica ? anterior.pagamento.taxaBps : taxas[p.pagamento.parcelas - 1];
  if (p.pagamento.forma === 'cartao' && (taxa === undefined || taxa !== p.pagamento.taxaBps)) throw new Error('Taxa de cartão divergente. Reabra as condições comerciais.');
  const documento = { ...p, itens };
  calcularPedido(documento);
  return documento;
}
export function validarTotais(p: Pedido, totais: {total: number; produtos: number; frete: number}) {
  const r = calcularPedido(p);
  if (r.total !== totais.total || r.produtos !== totais.produtos || r.frete !== totais.frete) throw new Error('Totais financeiros inconsistentes.');
  return r;
}
