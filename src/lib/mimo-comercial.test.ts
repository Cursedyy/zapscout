import { describe,it,expect } from 'vitest';
import { isoComercial, localComercial, diaComercial, contagensFollow, resumoPedidos, followSchema, type Follow } from './mimo-comercial';
import { evidenciaSegura } from './mimo-comercial.server';
describe('contexto e follow-ups internos',()=>{
  it('converte horário explicitamente para São Paulo, não para o dispositivo',()=>{expect(isoComercial('2026-11-19T09:30')).toBe('2026-11-19T12:30:00.000Z');expect(localComercial('2026-11-19T12:30:00Z')).toBe('2026-11-19T09:30');});
  it.each(['2026-02-30T10:00','2026-11-19T25:00','inválida'])('rejeita data inválida %s',v=>expect(()=>isoComercial(v)).toThrow());
  it('agrupa meia-noite por America/Sao_Paulo',()=>{expect(diaComercial('2026-11-19T02:59:00Z')).toBe('2026-11-18');expect(diaComercial('2026-11-19T03:00:00Z')).toBe('2026-11-19');});
  it('somente pendentes alertam, diferenciando prazo vencido e hoje',()=>{
    const itens=[{estado:'pendente',prazo:'2026-11-19T11:00:00Z'},{estado:'pendente',prazo:'2026-11-19T13:00:00Z'},{estado:'pendente',prazo:'2026-11-20T12:00:00Z'},{estado:'concluido',prazo:'2026-11-18T12:00:00Z'},{estado:'cancelado',prazo:'2026-11-18T12:00:00Z'}] as Follow[];
    expect(contagensFollow(itens,'2026-11-19T12:00:00Z')).toEqual({hoje:1,atrasados:1,proximos:1});
  });
  it('não conta rascunho, cancelamento, conversa ou pagamento aguardado como conversão',()=>{
    const itens=['rascunho','cancelado','aguardando_pagamento','confirmado','faturado','enviado','entregue'].map((status,i)=>({id:String(i),numero:i,status,total:10000}));
    expect(resumoPedidos(itens)).toEqual({vendas:4,valorConfirmado:40000,faturados:3,valorFaturado:30000});
    expect(resumoPedidos(itens.slice(0,3))).toEqual({vendas:0,valorConfirmado:0,faturados:0,valorFaturado:0});
  });
  it('evidência não devolve tokens ou URLs nem infere Meta quando ausente',()=>{expect(evidenciaSegura(null)).toBeNull();expect(evidenciaSegura({source_id:'synthetic',headline:'Campanha teste',token:'secret',source_url:'https://example.com/private'})).toEqual({referencia:'synthetic',titulo:'Campanha teste',tipo:null});});
  it('preserva o formato canônico do webhook, sem expor URL',()=>expect(evidenciaSegura({id:'ad-sintetico',url:'https://facebook.com/example',fonte:'metadado_whatsapp'})).toEqual({referencia:'ad-sintetico',titulo:null,tipo:'metadado_whatsapp'}));
  it('observação curta é limitada a 500 caracteres',()=>{const data={id:'10000000-0000-4000-8000-000000000001',lead_id:'10000000-0000-4000-8000-000000000002',operacao_id:'10000000-0000-4000-8000-000000000003',responsavel_id:'10000000-0000-4000-8000-000000000004',versao:0,acao:'agendar',prazo:'2026-11-19T12:00:00Z',observacao:'a'.repeat(500)};expect(followSchema.safeParse(data).success).toBe(true);expect(followSchema.safeParse({...data,observacao:'a'.repeat(501)}).success).toBe(false);});
});