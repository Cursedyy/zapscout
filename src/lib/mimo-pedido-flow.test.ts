import { expect,it } from 'vitest';
import { CATALOGO, MODELOS, carregarModelo, novoPedido, calcularPedido, sugerirCaixas, assinaturaFrete, validarSalvar, itemDeProduto, conferirDistribuicao, type Pedido } from '@/lib/mimo-pedido';
import { mensagemWhatsApp, gerarPdfProposta } from '@/lib/mimo-proposta';

it('executa o cenário comercial completo em memória sem criar dados no banco',async()=>{
  const modelo=MODELOS[1],produto=CATALOGO[0];if(!modelo||!produto)throw new Error('Catálogo incompleto.');
  let p:Pedido={...novoPedido(),leadId:'00000000-0000-4000-8000-000000000001',cliente:'Cliente fictício isolado',responsavelId:'00000000-0000-4000-8000-000000000002',itens:carregarModelo(modelo,CATALOGO)};
  expect(calcularPedido(p).produtos).toBe(96875);
  const primeiro=p.itens[0];if(!primeiro)throw new Error('Modelo vazio.');
  p={...p,itens:[{...primeiro,precoNegociado:5500,desconto:{modo:'fixo',valor:1000}},...p.itens.slice(1),itemDeProduto(produto,1,true)],descontoGeral:{modo:'percentual',valor:500}};
  expect(calcularPedido(p).produtos).toBe(89238);
  p={...p,volumes:sugerirCaixas(p.itens).map(v=>({...v,confirmado:true})),destinoCep:'01001000',endereco:'Endereço fictício isolado',fretePagador:'cliente'};
  expect(conferirDistribuicao(p.itens,p.volumes)).toBe(true);
  p={...p,cotacoes:[{id:'cotacao',modalidade:'Manual',prazo:'3 dias',modo:'remessa',valor:3000,valoresVolumes:{},oficial:true,assinatura:assinaturaFrete(p),registradaEm:'2026-10-30T16:00:00Z'}],cotacaoId:'cotacao',pagamento:{...p.pagamento,forma:'cartao',parcelas:3,taxaBps:368},status:'confirmado'};
  validarSalvar(p);const total=calcularPedido(p);expect(total.total).toBe(Math.ceil(89238*10000/9632)+3000);expect(total.parcelas.reduce((a,b)=>a+b,0)).toBe(total.total);
  const d={numero:'ISOLADO',versao:1,cliente:p.cliente,pedido:p};expect(mensagemWhatsApp(d)).toContain('892,38');
  const pdf=await gerarPdfProposta(d);expect(pdf.size).toBeGreaterThan(1000);
  p={...p,status:'faturado',pagamento:{...p.pagamento,faturadoEm:'2026-10-30'}};expect(validarSalvar(p).status).toBe('faturado');
});