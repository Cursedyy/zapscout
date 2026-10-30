import { calcularPedido, dinheiro, STATUS, vencimentosBoleto, type Pedido } from '@/lib/mimo-pedido';

export type DadosProposta = { numero: string; versao: number; cliente: string; pedido: Pedido };
function pagamento(p: Pedido, total: number, parcelas: number[]) {
  if (p.pagamento.forma === 'pix') return 'PIX antecipado';
  if (p.pagamento.forma === 'cartao') return `Cartão em ${parcelas.length}x de ${dinheiro(parcelas[0] ?? 0)}`;
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
export async function gerarPdfProposta(d: DadosProposta) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(255, 248, 238); doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(92, 51, 31); doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.text('MiMo', 18, 22);
  doc.setFontSize(10); doc.setTextColor(222, 103, 35); doc.text('Proposta comercial', 18, 29);
  doc.setTextColor(64, 45, 35); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = 42;
  for (const linha of linhasProposta(d)) { for (const parte of doc.splitTextToSize(linha, 172) as string[]) { if (y > 280) { doc.addPage(); doc.setFillColor(255, 248, 238); doc.rect(0, 0, 210, 297, 'F'); y = 20; } doc.text(parte, 18, y); y += 6; } }
  return doc.output('blob');
}