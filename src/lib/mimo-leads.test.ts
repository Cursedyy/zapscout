import { describe,it,expect } from 'vitest';
import { normalizarTelefoneMimo,podeEditarLead,leadMimoSchema } from './mimo-leads';
const base={nome_empresa:'Empresa real',nome_contato:'',telefone:'',perfil:'emporio',origem:'whatsapp',campanha_origem:'',anuncio_origem:'',entrada_em:'2026-10-01T12:00:00.000Z',etapa:'novo',qualificacao:'pendente',responsavel_id:null,valor_pedido:null,conversao_em:null,motivo_perda:'',observacoes:''};
describe('MiMo regras comerciais',()=>{
 it('unifica telefone brasileiro com e sem DDI',()=>expect(normalizarTelefoneMimo('(11) 98765-4321')).toBe(normalizarTelefoneMimo('+55 11 98765-4321')));
 it('preserva leads sem telefone',()=>expect(normalizarTelefoneMimo('')).toBeNull());
 it('rejeita telefone inválido',()=>expect(()=>normalizarTelefoneMimo('123')).toThrow());
 it('administrador edita todos',()=>expect(podeEditarLead('administrador','a','b')).toBe(true));
 it('gestor edita todos',()=>expect(podeEditarLead('gestor','a',null)).toBe(true));
 it('vendedor edita somente seus leads',()=>{expect(podeEditarLead('vendedor','a','a')).toBe(true);expect(podeEditarLead('vendedor','a','b')).toBe(false);expect(podeEditarLead('vendedor','a',null)).toBe(false);});
 it('exige motivo da perda',()=>expect(leadMimoSchema.safeParse({...base,etapa:'perdido'}).success).toBe(false));
 it('exige valor no pedido fechado',()=>expect(leadMimoSchema.safeParse({...base,etapa:'pedido_fechado',conversao_em:'2026-10-02T12:00:00.000Z'}).success).toBe(false));
 it('exige data no pedido fechado',()=>expect(leadMimoSchema.safeParse({...base,etapa:'pedido_fechado',valor_pedido:100}).success).toBe(false));
 it('aceita pedido com valor e data consistentes',()=>expect(leadMimoSchema.safeParse({...base,etapa:'pedido_fechado',valor_pedido:100,conversao_em:'2026-10-02T12:00:00.000Z'}).success).toBe(true));
 it('rejeita conversão antes da entrada',()=>expect(leadMimoSchema.safeParse({...base,conversao_em:'2026-09-01T12:00:00.000Z'}).success).toBe(false));
 it('rejeita valores negativos',()=>expect(leadMimoSchema.safeParse({...base,valor_pedido:-1}).success).toBe(false));
 it('preserva conversão ao reabrir negociação',()=>expect(leadMimoSchema.parse({...base,etapa:'em_negociacao',valor_pedido:100,conversao_em:'2026-10-02T12:00:00.000Z'}).valor_pedido).toBe(100));
});