import { describe,it,expect } from 'vitest';
import { exigirMimo,salvarLeadMimo } from './mimo-leads.server';
import { leadMimoSchema } from './mimo-leads';
type DB=Parameters<typeof exigirMimo>[0];
const input=leadMimoSchema.parse({nome_empresa:'Empresa',nome_contato:'',telefone:'',perfil:'outro',origem:'outra',campanha_origem:'',anuncio_origem:'',entrada_em:'2026-10-01T12:00:00.000Z',etapa:'novo',qualificacao:'pendente',responsavel_id:null,valor_pedido:null,conversao_em:null,motivo_perda:'',observacoes:''});
function banco(papel:string|null, ativo=true, atualResponsavel:string|null='u',conflict=false){
 const filtros:unknown[]=[];const escritas:unknown[]=[];
 const db={from:(t:string)=>{
  let escrevendo=false;const q={select:()=>q,eq:(k:string,v:unknown)=>{filtros.push([t,k,v]);return q;},insert:(v:unknown)=>{escritas.push(v);escrevendo=true;return q;},update:(v:unknown)=>{escritas.push(v);escrevendo=true;return q;},maybeSingle:async()=>({error:null,data:t==='empresas'?{id:'mimo',ativa:true}:t==='empresa_membros'?(papel?{papel,ativo}:null):escrevendo?(conflict?null:{id:'lead'}):{responsavel_id:atualResponsavel}})};return q;
 }};return {db:db as unknown as DB,filtros,escritas};
}
describe('MiMo autorização independente no servidor',()=>{
 it('nega leitura sem vínculo',async()=>{await expect(exigirMimo(banco(null).db,'u')).rejects.toThrow('Acesso negado');});
 it('nega vínculo inativo',async()=>{await expect(exigirMimo(banco('gestor',false).db,'u')).rejects.toThrow('Acesso negado');});
 it('cadastra sob empresa fixa e autor autenticado',async()=>{const b=banco('administrador');await salvarLeadMimo(b.db,'u',input);expect(b.filtros).toContainEqual(['empresas','slug','mimo']);expect(b.escritas[0]).toMatchObject({empresa_id:'mimo',created_by:'u'});});
 it('vendedor não cadastra para outro responsável',async()=>{const b=banco('vendedor');await expect(salvarLeadMimo(b.db,'u',input)).rejects.toThrow('seus leads');expect(b.escritas).toHaveLength(0);});
 it('vendedor não toma lead de colega',async()=>{const b=banco('vendedor',true,'colega');await expect(salvarLeadMimo(b.db,'u',{...input,id:'00000000-0000-0000-0000-000000000001',updated_at:'2026-10-01T12:00:00.000Z',responsavel_id:'u'})).rejects.toThrow('Acesso negado');expect(b.escritas).toHaveLength(0);});
 it('edição usa empresa e versão para evitar sobrescrever mudanças',async()=>{const b=banco('gestor');await salvarLeadMimo(b.db,'u',{...input,id:'00000000-0000-0000-0000-000000000001',updated_at:'2026-10-01T12:00:00.000Z'});expect(b.filtros).toContainEqual(['mimo_leads','empresa_id','mimo']);expect(b.filtros).toContainEqual(['mimo_leads','updated_at','2026-10-01T12:00:00.000Z']);});
 it('conflito não anuncia salvamento',async()=>{const b=banco('gestor',true,'u',true);await expect(salvarLeadMimo(b.db,'u',{...input,id:'00000000-0000-0000-0000-000000000001',updated_at:'2026-10-01T12:00:00.000Z'})).rejects.toThrow('mudou durante');});
 it('vendedor não revisa prioridade',async()=>{const b=banco('vendedor');await expect(salvarLeadMimo(b.db,'u',{...input,id:'00000000-0000-0000-0000-000000000001',updated_at:'2026-10-01T12:00:00.000Z',responsavel_id:'u',prioridade_revisada:'alta'})).rejects.toThrow('administrador ou gestor');expect(b.escritas).toHaveLength(0);});
});
