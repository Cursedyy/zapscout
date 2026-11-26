import { calcularPedido, ehEnvioSeparado, dinheiro, vencimentosBoleto, type Pedido } from '@/lib/mimo-pedido';

export type DadosProposta = { numero: string; versao: number; cliente: string; pedido: Pedido };
function pagamento(p: Pedido, total: number, parcelas: number[]) {
  if (p.pagamento.forma === 'pix') return 'PIX antecipado';
  if (p.pagamento.forma === 'cartao') return `Cartão em ${parcelas.length}x: ${parcelas.map(dinheiro).join(' + ')}`;
  return `Boleto: ${vencimentosBoleto(total, p.pagamento.diasBoleto, p.pagamento.faturadoEm).map(v => `${v.dias} dias ${dinheiro(v.valor)}`).join(', ')}`;
}
/** Texto destinado ao cliente: sem versão, status ou rótulos internos de rascunho. */
export function linhasProposta({ numero, cliente, pedido }: DadosProposta) {
  const r = calcularPedido(pedido);
  const itens = pedido.itens.map(i => `${i.quantidade} × ${i.nome} (${i.unidade})${i.brinde ? (ehEnvioSeparado(i) ? ' — BONIFICAÇÃO · Envio separado' : ' — BONIFICAÇÃO') : ` — ${dinheiro(i.precoNegociado)} un.`}`);
  return [
    tituloProposta(numero), `Cliente: ${cliente || 'Não informado'}`, '', ...itens, '',
    `Produtos: ${dinheiro(r.negociado)}`, `Descontos: ${dinheiro(r.descontos)}`, `Frete: ${pedido.fretePagador === 'cliente' ? dinheiro(r.frete) : 'por conta da MiMo'}`,
    `Pagamento: ${pagamento(pedido, r.total, r.parcelas)}`, `Total: ${dinheiro(r.total)}`, ...(pedido.observacoes.trim() ? ['', `Observações: ${pedido.observacoes.trim()}`] : []),
  ];
}
export function mensagemWhatsApp(d: DadosProposta) { return ['Olá! Segue o resumo da proposta MiMo:', '', ...linhasProposta(d)].join('\n'); }
export function linkWhatsApp(telefone: string, texto: string) { const n = telefone.replace(/\D/g, ''); return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`; }
/* Identidade oficial MiMo: laranja #FC6C12, marrom #612808, creme #F8F3DD */
type RGB = [number, number, number];
const COR_MARROM: RGB = [97, 40, 8];
const COR_LARANJA: RGB = [252, 108, 12];
const COR_CREME: RGB = [252, 249, 236];
const COR_LINHA: RGB = [232, 222, 200];
const COR_TEXTO: RGB = [30, 30, 30];
const COR_SUAVE: RGB = [110, 100, 90];
const M = 12.5, L = 210, A = 297, W = L - 2 * M, LIMITE = A - 18;
/* Somente dados institucionais já usados no projeto; sem CNPJ ou dados fiscais não confirmados. */
const EMPRESA = ['MiMo · Esse Pode!', 'mimoessepode.com.br', 'Pelotas – RS'];
const COLS = [
  { t: 'Código', w: 22, a: 'left' }, { t: 'Descrição', w: 78, a: 'left' }, { t: 'Quantidade', w: 20, a: 'right' },
  { t: 'Unitário', w: 22, a: 'right' }, { t: 'Desconto', w: 21, a: 'right' }, { t: 'Total', w: 22, a: 'right' },
] as const;
function descontoItem(i: Pedido['itens'][number]) {
  const bruto = i.precoNegociado * i.quantidade;
  return i.desconto.modo === 'fixo' ? i.desconto.valor : Math.round(bruto * i.desconto.valor / 10000);
}
export function tituloProposta(numero: string) { return /^\d+$/.test(numero) ? `Proposta MiMo · Pedido ${numero}` : 'Proposta MiMo'; }
export function linhasTabelaProposta(p: Pedido) {
  return p.itens.map(i => {
    const sep = ehEnvioSeparado(i);
    const desc = `${i.nome}${i.unidade ? ` (${i.unidade})` : ''}${i.brinde ? (sep ? ' — BONIFICAÇÃO · Envio separado' : ' — BONIFICAÇÃO') : ''}`;
    if (i.brinde) return [i.codigo.startsWith('BR:') ? '—' : (i.codigo || '—'), desc, String(i.quantidade), '—', '—', 'Bonificado'];
    const d = descontoItem(i);
    return [i.codigo || '—', desc, String(i.quantidade), dinheiro(i.precoNegociado), d ? dinheiro(d) : '—', dinheiro(i.precoNegociado * i.quantidade - d)];
  });
}
export async function gerarPdfProposta(d: DadosProposta) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const p = d.pedido, r = calcularPedido(p);
  const cor = (c: RGB) => doc.setTextColor(...c);
  const fonte = (estilo: 'normal' | 'bold' | 'bolditalic', t: number) => { doc.setFont('helvetica', estilo); doc.setFontSize(t); };
  let y = M;
  // Cabeçalho
  cor(COR_MARROM); fonte('bold', 18); doc.text('MiMo.', M, y + 6);
  cor(COR_LARANJA); fonte('bolditalic', 9); doc.text('Esse Pode!', M + 20, y + 6);
  cor(COR_SUAVE); fonte('normal', 8);
  EMPRESA.forEach((t, k) => { if (k === 0) { fonte('bold', 8.5); cor(COR_TEXTO); } else { fonte('normal', 8); cor(COR_SUAVE); } doc.text(t, L - M, y + 3 + k * 4, { align: 'right' }); });
  y += 18;
  cor(COR_TEXTO); fonte('bold', 15); doc.text(tituloProposta(d.numero), M, y); y += 4;
  doc.setDrawColor(...COR_LARANJA); doc.setLineWidth(0.6); doc.line(M, y, L - M, y); y += 6;
  // Cliente
  fonte('bold', 9.5); cor(COR_MARROM); doc.text('Informações do cliente', M, y); y += 5;
  const colW = W / 2 - 4;
  const esq: string[][] = [['Cliente', d.cliente || 'Não informado']];
  const dir: string[][] = [];
  if (p.endereco.trim()) dir.push(['Endereço', p.endereco.trim()]);
  if (p.destinoCep) dir.push(['CEP', p.destinoCep.replace(/^(\d{5})(\d{3})$/, '$1-$2')]);
  const bloco = (campos: string[][], x: number) => { let yy = y; for (const [k, v] of campos) { fonte('bold', 8); cor(COR_SUAVE); doc.text(k, x, yy); yy += 3.8; fonte('normal', 9); cor(COR_TEXTO); for (const s of doc.splitTextToSize(v, colW) as string[]) { doc.text(s, x, yy); yy += 4; } yy += 1.5; } return yy; };
  y = Math.max(bloco(esq, M), bloco(dir, M + W / 2 + 4)) + 3;
  // Tabela
  const cabecalho = () => {
    doc.setFillColor(...COR_LARANJA); doc.rect(M, y, W, 7, 'F'); fonte('bold', 8); doc.setTextColor(255, 255, 255);
    let x = M; for (const c of COLS) { doc.text(c.t, c.a === 'right' ? x + c.w - 2 : x + 2, y + 4.7, { align: c.a }); x += c.w; } y += 7;
  };
  const novaPagina = () => { doc.addPage(); y = M; };
  cabecalho();
  fonte('normal', 8.5);
  linhasTabelaProposta(p).forEach((linha, n) => {
    fonte('normal', 8.5);
    const partes = linha.map((v, k) => doc.splitTextToSize(v, COLS[k]!.w - 4) as string[]);
    const h = Math.max(...partes.map(x => x.length)) * 3.8 + 2.8;
    if (y + h > LIMITE) { novaPagina(); cabecalho(); fonte('normal', 8.5); }
    if (n % 2 === 0) { doc.setFillColor(...COR_CREME); doc.rect(M, y, W, h, 'F'); }
    doc.setDrawColor(...COR_LINHA); doc.setLineWidth(0.2); doc.line(M, y + h, L - M, y + h);
    cor(COR_TEXTO); let x = M;
    partes.forEach((ls, k) => { const c = COLS[k]!; ls.forEach((s, j) => doc.text(s, c.a === 'right' ? x + c.w - 2 : x + 2, y + 4.4 + j * 3.8, { align: c.a })); x += c.w; });
    y += h;
  });
  // Resumo
  const resumo: [string, string, boolean?][] = [
    ['Produtos', dinheiro(r.negociado)], ['Descontos', r.descontos ? `- ${dinheiro(r.descontos)}` : dinheiro(0)],
    ...(r.bonificacoes ? [['Bonificações (sem cobrança)', dinheiro(r.bonificacoes)] as [string, string]] : []),
    ['Frete', p.fretePagador === 'cliente' ? dinheiro(r.frete) : p.fretePagador === 'mimo' ? 'Por conta da MiMo' : 'A definir'],
    ['Total', dinheiro(r.total), true],
  ];
  y += 4; if (y + resumo.length * 5.5 + 4 > LIMITE) novaPagina();
  const xr = L - M - 75;
  for (const [k, v, forte] of resumo) {
    if (forte) { doc.setDrawColor(...COR_LARANJA); doc.setLineWidth(0.4); doc.line(xr, y - 1, L - M, y - 1); y += 3; }
    fonte(forte ? 'bold' : 'normal', forte ? 11 : 9); cor(forte ? COR_MARROM : COR_TEXTO);
    doc.text(k, xr, y + 2); doc.text(v, L - M, y + 2, { align: 'right' }); y += forte ? 7 : 5.5;
  }
  // Outras informações
  const outras: [string, string][] = [['Pagamento', pagamento(p, r.total, r.parcelas)]];
  const separados = p.itens.filter(i => i.brinde && ehEnvioSeparado(i));
  if (separados.length) outras.push(['Envio separado', separados.map(i => `${i.quantidade} × ${i.nome}`).join('; ')]);
  if (p.observacoes.trim()) outras.push(['Observações', p.observacoes.trim()]);
  y += 4; if (y + 14 > LIMITE) novaPagina();
  fonte('bold', 9.5); cor(COR_MARROM); doc.text('Outras informações', M, y); y += 2;
  doc.setDrawColor(...COR_LINHA); doc.setLineWidth(0.3); doc.line(M, y, L - M, y); y += 5;
  for (const [k, v] of outras) {
    fonte('normal', 9); const ls = doc.splitTextToSize(v, W - 32) as string[];
    for (let j = 0; j < ls.length; j++) {
      if (y > LIMITE) novaPagina();
      if (j === 0) { fonte('bold', 8.5); cor(COR_SUAVE); doc.text(k, M, y); }
      fonte('normal', 9); cor(COR_TEXTO); doc.text(ls[j]!, M + 32, y); y += 4.2;
    }
    y += 1.5;
  }
  // Rodapé
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n); doc.setDrawColor(...COR_LINHA); doc.setLineWidth(0.2); doc.line(M, A - 11, L - M, A - 11);
    fonte('normal', 7.5); cor(COR_SUAVE);
    doc.text(tituloProposta(d.numero), M, A - 7); doc.text(`Página ${n} de ${total}`, L - M, A - 7, { align: 'right' });
  }
  return doc.output('blob');
}
