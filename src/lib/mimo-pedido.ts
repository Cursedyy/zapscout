import { z } from 'zod';

const inteiro = z.number().int().min(0).max(100_000_000);
export const produtoSchema = z.object({
  codigo: z.string().trim().min(1).max(30), nome: z.string().trim().min(2).max(200),
  categoria: z.string().max(80), descricao: z.string().max(2000).default(''),
  unidade: z.string().max(80), tipo: z.enum(['display','misturinha','outro']),
  pesoG: inteiro.nullable(), preco: inteiro.nullable(), ativo: z.boolean(),
}).superRefine((p,c)=>{if(p.ativo&&(p.preco===null||p.pesoG===null||!p.unidade.trim()))c.addIssue({code:'custom',message:'Confirme preço, unidade e peso antes de ativar.'});});
export type Produto = z.infer<typeof produtoSchema>;
const iniciais: Array<[string,string,number,'display'|'misturinha']> = [
  ['M001','Barrinha Banana e Cacau',5985,'display'],['M002','Barrinha Maçã e Mamão',5985,'display'],['M003','Barrinha Tâmara e Maçã',5985,'display'],
  ['M004','Bolo Chocolate 300 g',1039,'misturinha'],['M006','Bolo Laranja 300 g',1039,'misturinha'],['M007','Bolo Cenoura 300 g',1039,'misturinha'],['M014','Bolo Rose Velvet 300 g',1858,'misturinha'],['M015','Bolo Milho 300 g',1039,'misturinha'],
  ['M005','Panqueca Cenoura 300 g',1199,'misturinha'],['M008','Panqueca Beterraba 300 g',1199,'misturinha'],['M009','Panqueca Espinafre 300 g',1199,'misturinha'],['M016','Panqueca Cacau 300 g',1199,'misturinha'],
];
export const CATALOGO: Produto[] = iniciais.map(([codigo,nome,preco,tipo])=>({codigo,nome,preco,tipo,categoria:tipo==='display'?'Barrinhas':nome.startsWith('Bolo')?'Bolos':'Panquecas',unidade:tipo==='display'?'Display de 15':'Unidade',pesoG:tipo==='display'?450:300,ativo:true,descricao:''}));
for(const [inicio,fim,categoria] of [[17,19,'Snacks'],[20,23,'Macarrões'],[24,26,'Meu Primeiro Bolinho'],[27,29,'Temperinhos'],[30,33,'Geleias']] as const){for(let i=inicio;i<=fim;i++)CATALOGO.push({codigo:`M0${i}`,nome:`${categoria} · M0${i}`,categoria,unidade:'',pesoG:null,preco:null,ativo:false,tipo:'outro',descricao:''});}
export const modeloSchema=z.object({id:z.string().min(1).max(80),nome:z.string().trim().min(2).max(120),itens:z.array(z.object({codigo:z.string().max(30),quantidade:z.number().int().min(1).max(1000)})).min(1).max(100)});
export type Modelo=z.infer<typeof modeloSchema>;
const quantidades=[[2,2,1,2,2,2,2,2,2,1,1,2],[4,4,2,4,4,3,5,3,3,2,2,4],[6,6,4,6,6,6,6,6,5,5,5,5]];
export const MODELOS:Modelo[]=['Compacto','Inicial','Completo'].map((nome,i)=>({id:nome.toLowerCase(),nome:`PDV ${nome}`,itens:iniciais.map(([codigo],j)=>({codigo,quantidade:quantidades[i]?.[j]??1}))}));
export const descontoSchema=z.object({modo:z.enum(['percentual','fixo']),valor:inteiro}).superRefine((d,c)=>{if(d.modo==='percentual'&&d.valor>10000)c.addIssue({code:'custom',message:'Desconto máximo: 100%.'});});
export type Desconto=z.infer<typeof descontoSchema>;
export const SEM_DESCONTO:Desconto={modo:'percentual',valor:0};
export const itemSchema=z.object({id:z.string().min(1).max(80),codigo:z.string().max(30),nome:z.string().min(1).max(200),unidade:z.string().max(80),tipo:z.enum(['display','misturinha','outro']),quantidade:z.number().int().min(1).max(1000),precoOriginal:inteiro,precoNegociado:inteiro,desconto:descontoSchema,brinde:z.boolean(),custoInterno:inteiro.nullable(),pesoG:inteiro.nullable()});
export type ItemPedido=z.infer<typeof itemSchema>;
export const CAIXAS={P:{nome:'Caixa P',dimensoes:[23,16,17],displays:4,misturinhas:10},G:{nome:'Caixa G',dimensoes:[24,24,18],displays:8,misturinhas:16}} as const;
export const volumeSchema=z.object({id:z.string().min(1).max(80),caixa:z.enum(['P','G']),conteudo:z.array(z.object({itemId:z.string(),quantidade:z.number().int().min(1).max(1000)})).max(100),pesoAjustadoG:inteiro.nullable(),confirmado:z.boolean()});
export type Volume=z.infer<typeof volumeSchema>;
export const cotacaoSchema=z.object({id:z.string().min(1).max(80),modalidade:z.string().trim().min(1).max(100),prazo:z.string().trim().min(1).max(100),modo:z.enum(['remessa','volumes']),valor:inteiro,valoresVolumes:z.record(inteiro),assinatura:z.string(),registradaEm:z.string().datetime(),oficial:z.literal(true)});
export type Cotacao=z.infer<typeof cotacaoSchema>;
export const STATUS={rascunho:'Rascunho',aguardando_pagamento:'Aguardando pagamento',confirmado:'Confirmado',faturado:'Faturado',enviado:'Enviado',entregue:'Entregue',cancelado:'Cancelado'};
export type StatusPedido=keyof typeof STATUS;
export const PRAZOS_BOLETO=[14,21,28,35,42] as const;
export const pagamentoSchema=z.object({forma:z.enum(['pix','cartao','boleto']),parcelas:z.number().int().min(1).max(12),taxaBps:z.number().int().min(0).max(9999),diasBoleto:z.array(z.enum(['14','21','28','35','42'])).min(1).max(5),faturadoEm:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()});
export const pedidoSchema=z.object({
  leadId:z.string().uuid().nullable(),cliente:z.string().max(200),responsavelId:z.string().uuid().nullable(),
  itens:z.array(itemSchema).max(100),descontoGeral:descontoSchema,volumes:z.array(volumeSchema).max(300),
  origemCep:z.string().regex(/^\d{8}$/),destinoCep:z.string().regex(/^(\d{8})?$/),endereco:z.string().max(1000),
  declarado:inteiro,declaradoProvisorio:z.boolean(),cotacoes:z.array(cotacaoSchema).max(30),cotacaoId:z.string().nullable(),fretePagador:z.enum(['mimo','cliente']).nullable(),
  pagamento:pagamentoSchema,observacoes:z.string().max(10000),status:z.enum(['rascunho','aguardando_pagamento','confirmado','faturado','enviado','entregue','cancelado']),
}).superRefine((p,c)=>{if(new Set(p.itens.map(i=>i.id)).size!==p.itens.length)c.addIssue({code:'custom',message:'Itens repetidos.'});if(new Set(p.volumes.map(v=>v.id)).size!==p.volumes.length)c.addIssue({code:'custom',message:'Volumes repetidos.'});if(p.pagamento.forma==='boleto'&&new Set(p.pagamento.diasBoleto).size!==p.pagamento.diasBoleto.length)c.addIssue({code:'custom',message:'Vencimentos repetidos.'});});
export type Pedido=z.infer<typeof pedidoSchema>;
export type Recebimento={confirmadoEm:string;usuarioId:string;valor:number}|null;
export type PedidoSalvo={id:string;numero:number;versao:number;empresa_id:string;lead_id:string;documento:Pedido;pix:Recebimento;recebimentos:Recebimento[];created_at:string;updated_at:string;total:number;produtos:number;frete:number;status:StatusPedido};
export function novoPedido():Pedido{return {leadId:null,cliente:'',responsavelId:null,itens:[],descontoGeral:{...SEM_DESCONTO},volumes:[],origemCep:'96085440',destinoCep:'',endereco:'',declarado:0,declaradoProvisorio:true,cotacoes:[],cotacaoId:null,fretePagador:null,pagamento:{forma:'pix',parcelas:1,taxaBps:313,diasBoleto:['14'],faturadoEm:null},observacoes:'',status:'rascunho'};}
export function dinheiro(v:number){return (v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
export function centavos(v:string){if(!/^\d+(?:[.,]\d{0,2})?$/.test(v))throw new Error('Informe um valor com até duas casas decimais.');const [a,b='']=v.replace(',','.').split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>100_000_000)throw new Error('Valor inválido.');return n;}
export function descontar(valor:number,d:Desconto){const desconto=d.modo==='fixo'?d.valor:Math.round(valor*d.valor/10000);if(desconto>valor)throw new Error('Desconto excede o valor do produto.');return valor-desconto;}
export function taxaCartao(parcelas:number){if(!Number.isInteger(parcelas)||parcelas<1||parcelas>12)throw new Error('Cartão permite 1 a 12 parcelas.');return parcelas===1?313:parcelas<=6?368:589;}
export function dividirParcelas(total:number,n:number){if(!Number.isSafeInteger(total)||total<0||!Number.isInteger(n)||n<1||n>12)throw new Error('Parcelamento inválido.');const base=Math.floor(total/n),resto=total%n;return Array.from({length:n},(_,i)=>base+(i<resto?1:0));}
export function vencimentosBoleto(total:number,dias:string[],data:string|null){const parcelas=dividirParcelas(total,dias.length);return dias.map((dia,i)=>{if(!PRAZOS_BOLETO.includes(Number(dia) as typeof PRAZOS_BOLETO[number]))throw new Error('Prazo de boleto inválido.');let vencimento:string|null=null;if(data){const d=new Date(`${data}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+Number(dia));vencimento=d.toISOString().slice(0,10);}return {dias:Number(dia),valor:parcelas[i]??0,vencimento};});}
export function valorCotacao(c:Cotacao,volumes:Volume[]){if(c.modo==='remessa')return c.valor;if(Object.keys(c.valoresVolumes).length!==volumes.length||volumes.some(v=>c.valoresVolumes[v.id]===undefined))throw new Error('Informe o frete de todos os volumes.');return volumes.reduce((s,v)=>s+(c.valoresVolumes[v.id]??0),0);}
export function calcularPedido(p:Pedido){
  const original=p.itens.reduce((s,i)=>s+(i.brinde?0:i.precoOriginal*i.quantidade),0);
  const negociado=p.itens.reduce((s,i)=>s+(i.brinde?0:i.precoNegociado*i.quantidade),0);
  const aposIndividual=p.itens.reduce((s,i)=>s+(i.brinde?0:descontar(i.precoNegociado*i.quantidade,i.desconto)),0);
  const produtos=descontar(aposIndividual,p.descontoGeral);
  const c=p.cotacoes.find(c=>c.id===p.cotacaoId&&c.assinatura===assinaturaFrete(p));const frete=c?valorCotacao(c,p.volumes):0;
  const freteCliente=p.fretePagador==='cliente'?frete:0;
  const cartao=p.pagamento.forma==='cartao';const brutoProdutos=cartao?Math.ceil(produtos*10000/(10000-p.pagamento.taxaBps)):produtos;
  const total=brutoProdutos+freteCliente;const tarifa=cartao?Math.round(total*p.pagamento.taxaBps/10000):0;
  const absorvido=cartao?Math.max(0,produtos+freteCliente-(total-tarifa)):0;
  const parcelas=p.pagamento.forma==='boleto'?dividirParcelas(total,p.pagamento.diasBoleto.length):dividirParcelas(total,cartao?p.pagamento.parcelas:1);
  if(!Number.isSafeInteger(total)||total>100_000_000)throw new Error('Total fora do limite permitido.');
  return {original,negociado,aposIndividual,produtos,frete,freteCliente,brutoProdutos,total,tarifa,absorvido,parcelas,descontos:negociado-produtos,bonificacoes:p.itens.reduce((s,i)=>s+(i.brinde?i.precoOriginal*i.quantidade:0),0)};
}
export function itemDeProduto(p:Produto,quantidade=1,brinde=false):ItemPedido{if(!p.ativo||p.preco===null||p.pesoG===null||!p.unidade)throw new Error('Produto sem dados comerciais confirmados.');return {id:crypto.randomUUID(),codigo:p.codigo,nome:p.nome,unidade:p.unidade,tipo:p.tipo,quantidade,precoOriginal:p.preco,precoNegociado:p.preco,desconto:{...SEM_DESCONTO},brinde,custoInterno:null,pesoG:p.pesoG};}
export function carregarModelo(m:Modelo,catalogo:Produto[]){return m.itens.map(i=>{const p=catalogo.find(p=>p.codigo===i.codigo);if(!p)throw new Error(`Produto ${i.codigo} indisponível.`);return itemDeProduto(p,i.quantidade);});}
export function avaliarVolume(v:Volume,itens:ItemPedido[]){
  let displays=0,misturinhas=0,outros=0,peso=0,desconhecido=false;
  for(const c of v.conteudo){const i=itens.find(i=>i.id===c.itemId);if(!i)throw new Error('Item não encontrado no volume.');if(i.tipo==='display')displays+=c.quantidade;else if(i.tipo==='misturinha')misturinhas+=c.quantidade;else outros+=c.quantidade;if(i.pesoG===null)desconhecido=true;else peso+=i.pesoG*c.quantidade;}
  const caixa=CAIXAS[v.caixa];
  const comprovado=outros===0&&((misturinhas===0&&displays<=caixa.displays)||(displays===0&&misturinhas<=caixa.misturinhas)||(v.caixa==='P'&&displays<=2&&misturinhas<=6));
  return {comprovado,pesoProdutosG:desconhecido?null:peso,pesoCotacaoG:v.pesoAjustadoG??(desconhecido?null:peso),displays,misturinhas,outros};
}
export function conferirDistribuicao(itens:ItemPedido[],volumes:Volume[]){const mapa=new Map<string,number>();for(const v of volumes)for(const c of v.conteudo){if(!itens.some(i=>i.id===c.itemId))return false;mapa.set(c.itemId,(mapa.get(c.itemId)??0)+c.quantidade);}return itens.every(i=>mapa.get(i.id)===i.quantidade);}
// Dynamic programming uses only proved homogeneous capacities and P 2+6.
// It minimizes box count, then volume; unknown gifts get unverified manual volumes.
export function sugerirCaixas(itens:ItemPedido[]):Volume[]{
  const d=itens.filter(i=>i.tipo==='display').reduce((s,i)=>s+i.quantidade,0),m=itens.filter(i=>i.tipo==='misturinha').reduce((s,i)=>s+i.quantidade,0);
  if(d>300||m>600)throw new Error('Use distribuição manual para cargas acima de 300 displays ou 600 misturinhas.');
  type Plano={n:number;espaco:number;caixa:'P'|'G';d:number;m:number};const dp:Plano[][]=Array.from({length:d+1},()=>Array<Plano>(m+1));const zero=dp[0];if(zero)zero[0]={n:0,espaco:0,caixa:'P',d:0,m:0};
  const opcoes:Array<{caixa:'P'|'G';d:number;m:number}>=[];
  for(const caixa of ['P','G'] as const){for(let i=1;i<=CAIXAS[caixa].displays;i++)opcoes.push({caixa,d:i,m:0});for(let i=1;i<=CAIXAS[caixa].misturinhas;i++)opcoes.push({caixa,d:0,m:i});}
  for(let a=1;a<=2;a++)for(let b=1;b<=6;b++)opcoes.push({caixa:'P',d:a,m:b});
  for(let a=0;a<=d;a++)for(let b=0;b<=m;b++){if(a===0&&b===0)continue;let melhor:Plano|undefined;for(const o of opcoes){if(o.d>a||o.m>b)continue;const anterior=dp[a-o.d]?.[b-o.m];if(!anterior)continue;const candidato={...o,n:anterior.n+1,espaco:anterior.espaco+(o.caixa==='P'?6256:10368)};if(!melhor||candidato.n<melhor.n||(candidato.n===melhor.n&&candidato.espaco<melhor.espaco))melhor=candidato;}const linha=dp[a];if(linha&&melhor)linha[b]=melhor;}
  const restante=new Map(itens.map(i=>[i.id,i.quantidade]));const volumes:Volume[]=[];
  function retirar(tipo:ItemPedido['tipo'],n:number){const conteudo:Volume['conteudo']=[];for(const i of itens.filter(i=>i.tipo===tipo)){const q=Math.min(n,restante.get(i.id)??0);if(q){conteudo.push({itemId:i.id,quantidade:q});restante.set(i.id,(restante.get(i.id)??0)-q);n-=q;}if(!n)break;}return conteudo;}
  let a=d,b=m;while(a||b){const o=dp[a]?.[b];if(!o)throw new Error('Não foi possível distribuir.');volumes.push({id:crypto.randomUUID(),caixa:o.caixa,conteudo:[...retirar('display',o.d),...retirar('misturinha',o.m)],pesoAjustadoG:null,confirmado:false});a-=o.d;b-=o.m;}
  for(const i of itens.filter(i=>i.tipo==='outro'))volumes.push({id:crypto.randomUUID(),caixa:'G',conteudo:[{itemId:i.id,quantidade:i.quantidade}],pesoAjustadoG:null,confirmado:false});return volumes;
}
export function moverItem(volumes:Volume[],de:string,para:string,itemId:string,quantidade:number){if(de===para||!Number.isInteger(quantidade)||quantidade<1)throw new Error('Movimentação inválida.');const origem=volumes.find(v=>v.id===de),destino=volumes.find(v=>v.id===para);if(!origem||!destino||(origem.conteudo.find(c=>c.itemId===itemId)?.quantidade??0)<quantidade)throw new Error('Quantidade indisponível.');return volumes.map(v=>{if(v.id!==de&&v.id!==para)return v;const conteudo=v.conteudo.map(c=>({...c}));const c=conteudo.find(c=>c.itemId===itemId);if(v.id===de&&c)c.quantidade-=quantidade;else if(c)c.quantidade+=quantidade;else conteudo.push({itemId,quantidade});return {...v,conteudo:conteudo.filter(c=>c.quantidade>0),confirmado:false,pesoAjustadoG:null};});}
export function assinaturaFrete(p:Pedido){return JSON.stringify({itens:p.itens.map(i=>({id:i.id,quantidade:i.quantidade,pesoG:i.pesoG,tipo:i.tipo,precoOriginal:i.precoOriginal,precoNegociado:i.precoNegociado,brinde:i.brinde,desconto:i.desconto})),descontoGeral:p.descontoGeral,volumes:p.volumes,origem:p.origemCep,destino:p.destinoCep,endereco:p.endereco,declarado:p.declarado,provisorio:p.declaradoProvisorio});}
export function pendenciasPedido(p:Pedido,pix:Recebimento=null){const erros:string[]=[];if(!p.leadId)erros.push('Selecione um lead.');if(!p.itens.length)erros.push('Adicione ao menos um produto ou brinde.');if(!p.fretePagador)erros.push('Defina quem paga o frete.');if(!p.destinoCep||!p.endereco.trim())erros.push('Informe CEP e endereço de destino.');if(!conferirDistribuicao(p.itens,p.volumes)||!p.volumes.length)erros.push('Distribua todos os itens nas caixas.');if(p.volumes.some(v=>!v.confirmado||avaliarVolume(v,p.itens).pesoCotacaoG===null||!v.conteudo.length))erros.push('Confirme os volumes e seus pesos.');const c=p.cotacoes.find(c=>c.id===p.cotacaoId);if(!c||c.assinatura!==assinaturaFrete(p))erros.push('Registre e selecione uma cotação atual.');if(['faturado','enviado','entregue'].includes(p.status)){if(p.pagamento.forma==='pix'&&!pix)erros.push('Confirme o recebimento PIX antes de faturar ou enviar.');if(!p.pagamento.faturadoEm)erros.push('Registre a data de faturamento.');}return erros;}
export function validarSalvar(p:Pedido,pix:Recebimento=null){pedidoSchema.parse(p);calcularPedido(p);if(!p.leadId||!p.itens.length)throw new Error('Selecione um lead e adicione itens.');if(p.status!=='rascunho'&&p.status!=='cancelado'){const e=pendenciasPedido(p,pix);if(e.length)throw new Error(e[0]);}return p;}
export function indicadoresPedidos(pedidos:PedidoSalvo[]){const ativos=pedidos.filter(p=>p.status!=='cancelado');return {confirmados:ativos.filter(p=>['confirmado','faturado','enviado','entregue'].includes(p.status)).length,faturados:ativos.filter(p=>['faturado','enviado','entregue'].includes(p.status)).length,receitaCobrada:ativos.filter(p=>['confirmado','faturado','enviado','entregue'].includes(p.status)).reduce((s,p)=>s+p.total,0),recebidos:ativos.reduce((s,p)=>s+p.recebimentos.reduce((a,r)=>a+(r?.valor??0),0),0),fretes:ativos.filter(p=>p.status!=='rascunho').reduce((s,p)=>s+p.frete,0),bonificacoes:ativos.filter(p=>p.status!=='rascunho').reduce((s,p)=>s+calcularPedido(p.documento).bonificacoes,0)};}
export function podeAcessarPedido(empresaAtiva:boolean,membro:{ativo:boolean;papel:string;usuarioId:string;empresaId:string}|null,pedido:{empresaId:string;responsavelId:string|null}){return !!(empresaAtiva&&membro?.ativo&&membro.empresaId===pedido.empresaId&&(['administrador','gestor'].includes(membro.papel)||(membro.papel==='vendedor'&&membro.usuarioId===pedido.responsavelId)));}