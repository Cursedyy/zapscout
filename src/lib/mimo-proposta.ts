import { calcularPedido, dinheiro, STATUS, vencimentosBoleto, type Pedido } from '@/lib/mimo-pedido';

export type DadosProposta = { numero: string; versao: number; cliente: string; pedido: Pedido };
function pagamento(p: Pedido, total: number, parcelas: number[]) {
  if (p.pagamento.forma === 'pix') return 'PIX antecipado';
  if (p.pagamento.forma === 'cartao') return `Cartão em ${parcelas.length}x: ${parcelas.map(dinheiro).join(' + ')}`;
  return `Boleto: ${vencimentosBoleto(total, p.pagamento.diasBoleto, p.pagamento.faturadoEm).map(v => `${v.dias} dias ${dinheiro(v.valor)}`).join(', ')}`;
}
export function linhasProposta({ numero, versao, cliente, pedido }: DadosProposta) {
  const r = calcularPedido(pedido);
  const itens = pedido.itens.map(i => `${i.quantidade} × ${i.nome} (${i.unidade})${i.brinde ? ' — BONIFICAÇÃO' : ` — ${dinheiro(i.precoNegociado)} un.`}`);
  return [
    `Pedido ${numero} · versão ${versao}`, `Cliente: ${cliente || 'Não informado'}`, `Status: ${STATUS[pedido.status]}`, '', ...itens, '',
    `Produtos: ${dinheiro(r.negociado)}`, `Descontos: ${dinheiro(r.descontos)}`, `Frete: ${pedido.fretePagador === 'cliente' ? dinheiro(r.frete) : 'por conta da MiMo'}`,
    `Pagamento: ${pagamento(pedido, r.total, r.parcelas)}`, `Total: ${dinheiro(r.total)}`, ...(pedido.observacoes.trim() ? ['', `Observações: ${pedido.observacoes.trim()}`] : []),
  ];
}
export function mensagemWhatsApp(d: DadosProposta) { return ['Olá! Segue o resumo da proposta MiMo:', '', ...linhasProposta(d)].join('\n'); }
export function linkWhatsApp(telefone: string, texto: string) { const n = telefone.replace(/\D/g, ''); return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`; }
/* Identidade oficial MiMo: off-white #FFFCF7, marrom #612808, laranja #FC6C12 */
const COR_FUNDO: [number, number, number] = [255, 252, 247];
const COR_MARROM: [number, number, number] = [97, 40, 8];
const COR_LARANJA: [number, number, number] = [252, 108, 12];
const COR_TEXTO: [number, number, number] = [74, 44, 20];
function fundoPagina(doc: { setFillColor: (r: number, g: number, b: number) => void; rect: (x: number, y: number, w: number, h: number, f: string) => void }) {
  doc.setFillColor(...COR_FUNDO); doc.rect(0, 0, 210, 297, 'F');
}
export async function gerarPdfProposta(d: DadosProposta) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  fundoPagina(doc);
  doc.setTextColor(...COR_MARROM); doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.text('MiMo.', 18, 22);
  doc.setTextColor(...COR_LARANJA); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(13); doc.text('Esse Pode!', 42, 22);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Proposta comercial', 18, 29);
  doc.setDrawColor(...COR_LARANJA); doc.setLineWidth(1); doc.line(18, 33, 192, 33);
  doc.setTextColor(...COR_TEXTO); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = 42;
  for (const linha of linhasProposta(d)) { for (const parte of doc.splitTextToSize(linha, 172) as string[]) { if (y > 280) { doc.addPage(); fundoPagina(doc); y = 20; } doc.text(parte, 18, y); y += 6; } }
  return doc.output('blob');
}