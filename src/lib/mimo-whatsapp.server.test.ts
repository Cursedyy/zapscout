import { describe,it,expect,vi } from 'vitest';
import { receberWhatsappMimo } from './mimo-whatsapp.server';
type DB=Parameters<typeof receberWhatsappMimo>[0];
function dbMock({vinculo=true,owner='owner',erro=false,ambigua=false}={}){
 const filtros:unknown[]=[];const logs:unknown[]=[];
 const rpc=vi.fn(async()=>({error:erro?{code:'XX'}:null}));
 const db={rpc,from:(t:string)=>{const data=t==='mimo_whatsapp_vinculos'?(vinculo?{id:'v',empresa_id:'e',owner_id:'owner',instancia_id:null}:null):t==='profiles'?[{id:owner}]:t==='uazapi_instancias'?(ambigua?[{id:'i',user_id:'outra'}]:[]):null;const q={select:()=>q,eq:(k:string,v:unknown)=>{filtros.push([t,k,v]);return q;},maybeSingle:async()=>({data,error:null}),insert:async(v:unknown)=>{logs.push(v);return {error:null};},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return q;}};
 return {db:db as unknown as DB,rpc,filtros,logs};
}
const msg={id:'1',chatid:'5511987654321',fromMe:false};
describe('MiMo vínculo explícito',()=>{
 it('sem vínculo mantém somente processamento existente',async()=>{const b=dbMock({vinculo:false});expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'MiMo')).toBe(false);expect(b.rpc).not.toHaveBeenCalled();});
 it('vínculo é consultado pelo dono autenticado e hash',async()=>{const b=dbMock();await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi');expect(b.filtros).toContainEqual(['mimo_whatsapp_vinculos','owner_id','owner']);expect(b.filtros).toContainEqual(['mimo_whatsapp_vinculos','ativo',true]);expect(b.rpc).toHaveBeenCalledWith('mimo_receber_whatsapp',expect.objectContaining({_owner:'owner',_message_id:'1',_telefone:'5511987654321'}));});
 it('credencial de outro dono não associa',async()=>{const b=dbMock({owner:'outra'});expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).toBe(false);expect(b.rpc).not.toHaveBeenCalled();});
 it('credencial compartilhada é ambígua e não associa',async()=>{const b=dbMock({ambigua:true});expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).toBe(false);expect(b.rpc).not.toHaveBeenCalled();});
 it('erro registra código seguro e solicita retry',async()=>{const b=dbMock({erro:true});await expect(receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).rejects.toThrow('mimo_recebimento_falhou');expect(b.logs).toEqual([{empresa_id:'e',vinculo_id:'v',message_id:'1',codigo:'recebimento_falhou'}]);});
 it('grupo não chama transação comercial',async()=>{const b=dbMock();await receberWhatsappMimo(b.db,'owner','token-teste',{...msg,chatid:'5511987654321@g.us'},'oi');expect(b.rpc).not.toHaveBeenCalled();});
});