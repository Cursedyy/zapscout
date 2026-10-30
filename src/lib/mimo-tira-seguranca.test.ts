import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CATALOGO, calcularPedido, itemDeProduto, novoPedido, assinaturaFrete, sugerirCaixas, type Pedido, type StatusPedido, pedidoSchema } from '@/lib/mimo-pedido';
import { brindesPorPapel, documentoPorPapel, prepararDocumento, validarTotais, TRANSICOES, erroTransicao, podeConfirmarRecebimento, itemDeBrinde, compararVersoes, bloqueioAcao, prepararCaixas, CAIXAS_PADRAO } from '@/lib/mimo-tira-regras';
const taxas=[313,368,368,368,368,368,589,589,589,589,589,589];
const produto=CATALOGO.find(x=>x.codigo==='M001');if(!produto)throw new Error('Produto obrigatório ausente.');
const base=()=>({...novoPedido(),itens:[itemDeProduto(produto)]});
const brinde={id:'b1',nome:'Brinde reutilizável',unidade:'Unidade',pesoG:100,custoInterno:875,ativo:true};
function pronto():Pedido {const p={...base(),leadId:'00000000-0000-4000-8000-000000000001',destinoCep:'01001000',endereco:'Destino de teste em memória',fretePagador:'cliente' as const};p.volumes=sugerirCaixas(p.itens).map(v=>({...v,confirmado:true}));return {...p,cotacaoId:'c',cotacoes:[{id:'c',modalidade:'Manual',prazo:'3 dias',modo:'remessa',valor:1500,valoresVolumes:{},assinatura:assinaturaFrete(p),registradaEm:'2026-10-30T17:00:00Z',oficial:true}]};}
describe('Proteções finais do Tira-pedido',()=>{
 it('resposta do catálogo vendedor não revela custo 875',()=>{expect(brindesPorPapel([brinde],'vendedor')[0]?.custoInterno).toBeNull();expect(brindesPorPapel([brinde],'gestor')[0]?.custoInterno).toBe(875);});
 it('documento vendedor não revela custo',()=>{const p={...base(),itens:[itemDeBrinde(brinde)]};expect(documentoPorPapel(p,'vendedor').itens[0]?.custoInterno).toBeNull();expect(p.itens[0]?.custoInterno).toBe(875);});
 it('vendedor não injeta custo pelo pedido',()=>{expect(()=>prepararDocumento({...base(),itens:[itemDeBrinde(brinde)]},'vendedor',CATALOGO,[brinde],taxas,null)).toThrow(/restrito/);});
 it('vendedor bonifica e custo é resolvido no servidor',()=>{const i={...itemDeBrinde(brinde),custoInterno:null};const p=prepararDocumento({...base(),itens:[i]},'vendedor',CATALOGO,[brinde],taxas,null);expect(p.itens[0]?.custoInterno).toBe(875);expect(calcularPedido(p).total).toBe(0);});
 it('vendedor continua livre para oferecer brinde externo',()=>{const i={...itemDeBrinde({...brinde,custoInterno:null}),codigo:''};expect(calcularPedido(prepararDocumento({...base(),itens:[i]},'vendedor',CATALOGO,[],taxas,null)).total).toBe(0);});
 it('preserva custo histórico oculto ao editar',()=>{const old={...base(),itens:[itemDeBrinde(brinde)]};const p=prepararDocumento(documentoPorPapel(old,'vendedor'),'vendedor',CATALOGO,[],taxas,old);expect(p.itens[0]?.custoInterno).toBe(875);});
 it('preço original adulterado é substituído e negociação livre preservada',()=>{const p=base();p.itens=p.itens.map(i=>({...i,precoOriginal:1,precoNegociado:4321}));const doc=prepararDocumento(p,'vendedor',CATALOGO,[],taxas,null);expect(doc.itens[0]?.precoOriginal).toBe(5985);expect(calcularPedido(doc).total).toBe(4321);});
 it('taxa arbitrária de cartão é rejeitada',()=>{const p=base();p.pagamento={...p.pagamento,forma:'cartao',parcelas:3,taxaBps:0};expect(()=>prepararDocumento(p,'gestor',CATALOGO,[],taxas,null)).toThrow(/Taxa/);});
 it('taxa histórica é preservada',()=>{const p=base();p.pagamento={...p.pagamento,forma:'cartao',parcelas:3,taxaBps:368};expect(prepararDocumento(p,'gestor',CATALOGO,[],taxas.map(()=>500),p).pagamento.taxaBps).toBe(368);});
 it('totais inconsistentes são rejeitados',()=>{const p=base();expect(()=>validarTotais(p,{total:1,produtos:5985,frete:0})).toThrow(/inconsistentes/);expect(validarTotais(p,{total:5985,produtos:5985,frete:0}).total).toBe(5985);});
 it('vendedor confirma pedido completo e pode aguardar pagamento',()=>{expect(erroTransicao('vendedor','rascunho','confirmado',pronto(),null)).toBeNull();expect(erroTransicao('vendedor','rascunho','aguardando_pagamento',pronto(),null)).toBeNull();});
 it('fluxo gestão completo com PIX efetivamente confirmado',()=>{const p=pronto();p.pagamento.faturadoEm='2026-10-30';const pix={confirmadoEm:'2026-10-30T17:00:00Z',usuarioId:'ator',valor:7485};expect(erroTransicao('gestor','confirmado','faturado',p,pix)).toBeNull();expect(erroTransicao('gestor','faturado','enviado',p,pix)).toBeNull();expect(erroTransicao('gestor','enviado','entregue',p,pix)).toBeNull();});
 it('PIX não confirmado bloqueia envio',()=>{const p=pronto();p.pagamento.faturadoEm='2026-10-30';expect(erroTransicao('gestor','faturado','enviado',p,null)).toMatch(/PIX/);});
 it('recebimento entregue é bloqueado igual ao SQL',()=>expect(podeConfirmarRecebimento('gestor','entregue')).toBe(false));
 it('matriz SQL preparada coincide exatamente com as 49 combinações',()=>{const sql=readFileSync('docs/migracoes-preparadas/mimo-tira-pedido.sql','utf8');const bloco=sql.split('CREATE FUNCTION public.mimo_tira_transicao_ok')[1]?.split('$$;')[0]??'';const pares=new Set([...bloco.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)].map(m=>`${m[1]}:${m[2]}`));for(const de of Object.keys(TRANSICOES) as StatusPedido[])for(const para of Object.keys(TRANSICOES) as StatusPedido[])expect(pares.has(`${de}:${para}`)).toBe(TRANSICOES[de].includes(para));});
 it('comparação distingue brinde adicionado e quantidade alterada',()=>{const p=base();const r=compararVersoes(p,{...p,itens:[...p.itens.map(i=>({...i,quantidade:2})),itemDeBrinde(brinde)]});expect(r.some(d=>d.campo.includes('quantidade')&&d.depois==='2')).toBe(true);expect(r.some(d=>d.antes==='ausente')).toBe(true);});
});

describe('Regras das ações na interface',()=>{
 it('todas as ações indisponíveis sem persistência',()=>{for(const s of ['confirmado','faturado','enviado','entregue','cancelado'] as const)expect(bloqueioAcao('administrador','rascunho',s,false,true,true)).toMatch(/ativação/);});
 it('confirmação disponível ao vendedor só com versão salva sem alterações',()=>{expect(bloqueioAcao('vendedor','rascunho','confirmado',true,true,true)).toBeNull();expect(bloqueioAcao('vendedor','rascunho','confirmado',true,true,false)).toMatch(/alterações/);expect(bloqueioAcao('vendedor','rascunho','confirmado',true,false,true)).toMatch(/Salve/);});
 it('faturamento e cancelamento bloqueados para vendedor',()=>{expect(bloqueioAcao('vendedor','confirmado','faturado',true,true,true)).toMatch(/gestor/);expect(bloqueioAcao('vendedor','confirmado','cancelado',true,true,true)).toMatch(/gestor/);});
 it('não apresenta entrega disponível antes do envio',()=>{expect(bloqueioAcao('gestor','faturado','entregue',true,true,true)).toMatch(/Indisponível/);expect(bloqueioAcao('gestor','enviado','entregue',true,true,true)).toBeNull();});
});

describe('Logística e datas validadas',()=>{
 it('rejeita data impossível no documento comercial',()=>{const p=base();p.pagamento.faturadoEm='2026-02-30';expect(()=>pedidoSchema.parse(p)).toThrow();});
 it('rejeita dimensões de caixa forjadas',()=>{const p=pronto();p.volumes=p.volumes.map(v=>({...v,tipoCaixa:{nome:'Forjada',dimensoes:[99,99,99] as [number,number,number],displays:100,misturinhas:100}}));expect(()=>prepararCaixas(p,CAIXAS_PADRAO,null)).toThrow(/divergentes/);});
 it('preserva caixa histórica padrão sem acrescentar campos à assinatura',()=>{const p=pronto();expect(prepararCaixas(p,CAIXAS_PADRAO,p).volumes).toEqual(p.volumes);});
});
