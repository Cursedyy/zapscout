import { describe,it,expect,vi } from 'vitest';
import { receberWhatsappMimo } from './mimo-whatsapp.server';
const provider = vi.hoisted(() => ({ status: vi.fn(async () => ({ status: 'connected', profileNumber: '5511888888888' })) }));
vi.mock('./uazapi.server', () => ({ uazStatus: provider.status }));
type DB=Parameters<typeof receberWhatsappMimo>[0];
function dbMock({vinculo=true,owner='owner',erro=false,ambigua=false}={}){
 const filtros:unknown[]=[];const logs:unknown[]=[];
 const rpc=vi.fn(async()=>({error:erro?{code:'XX'}:null}));
 const db={rpc,from:(t:string)=>{const data=t==='mimo_whatsapp_vinculos'?(vinculo?{id:'v',empresa_id:'e',owner_id:'owner',instancia_id:null,numero_comercial:'5511888888888'}:null):t==='profiles'?[{id:owner}]:t==='uazapi_instancias'?(ambigua?[{id:'i',user_id:'outra'}]:[]):null;const q={select:()=>q,eq:(k:string,v:unknown)=>{filtros.push([t,k,v]);return q;},maybeSingle:async()=>({data,error:null}),insert:async(v:unknown)=>{logs.push(v);return {error:null};},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return q;}};
 return {db:db as unknown as DB,rpc,filtros,logs};
}
const msg={id:'1',chatid:'5511987654321',fromMe:false};
describe('MiMo vínculo explícito',()=>{
 it('registra a opção de distribuidor de uma resposta de lista',async ()=>{
  const b=dbMock();
  const content=JSON.stringify({listResponseMessage:{singleSelectReply:{selectedRowId:'mimo_quero_distribuir'}}});
  await receberWhatsappMimo(b.db,'owner','token-teste',{...msg,content},'');
  expect(b.rpc).toHaveBeenCalledWith('mimo_receber_whatsapp',expect.objectContaining({
   _message_id:'1',_texto:'Quero distribuir',_from_me:false,
  }));
 });
 it.each([
  {buttonOrListid:'mimo_representacao'},
  {content:JSON.stringify({selectedButtonId:'mimo_representacao'})},
 ])('registra o clique como resposta do lead com o ID original',async (selecao)=>{
  const b=dbMock();
  await receberWhatsappMimo(b.db,'owner','token-teste',{...msg,...selecao},'');
  expect(b.rpc).toHaveBeenCalledWith('mimo_receber_whatsapp',expect.objectContaining({
   _message_id:'1',_texto:'Quero ser representante',_from_me:false,
  }));
 });
 it('eco com prefixo do remetente usa o mesmo ID retornado pelo envio',async()=>{const b=dbMock();await receberWhatsappMimo(b.db,'owner','token-teste',{...msg,id:'5511888888888:3EB0SINTETICO',fromMe:true},'oi');expect(b.rpc).toHaveBeenCalledWith('mimo_receber_whatsapp',expect.objectContaining({_message_id:'3EB0SINTETICO',_from_me:true}));});
 it('mensagem recebida mantém o ID original para preservar deduplicação',async()=>{const b=dbMock();await receberWhatsappMimo(b.db,'owner','token-teste',{...msg,id:'5511888888888:3EB0SINTETICO'},'oi');expect(b.rpc).toHaveBeenCalledWith('mimo_receber_whatsapp',expect.objectContaining({_message_id:'5511888888888:3EB0SINTETICO',_from_me:false}));});
 it('recusa outro número no mesmo token sem nova confirmação comercial',async()=>{provider.status.mockResolvedValueOnce({status:'connected',profileNumber:'5511777777777'});const b=dbMock();expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).toBe(true);expect(b.rpc).not.toHaveBeenCalled();});
 it('status ao vivo indisponível pede retry sem cadastrar um lead',async()=>{provider.status.mockRejectedValueOnce(new Error('indisponivel'));const b=dbMock();await expect(receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).rejects.toThrow('mimo_numero_live_indisponivel');expect(b.rpc).not.toHaveBeenCalled();});
 it('sem vínculo mantém somente processamento existente',async()=>{const b=dbMock({vinculo:false});expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'MiMo')).toBe(false);expect(b.rpc).not.toHaveBeenCalled();});
 it('vínculo é consultado pelo dono autenticado e hash',async()=>{const b=dbMock();await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi');expect(b.filtros).toContainEqual(['mimo_whatsapp_vinculos','owner_id','owner']);expect(b.filtros).toContainEqual(['mimo_whatsapp_vinculos','ativo',true]);expect(b.rpc).toHaveBeenCalledWith('mimo_receber_whatsapp',expect.objectContaining({_owner:'owner',_message_id:'1',_telefone:'5511987654321'}));});
 it('credencial de outro dono não associa',async()=>{const b=dbMock({owner:'outra'});expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).toBe(true);expect(b.rpc).not.toHaveBeenCalled();});
 it('credencial compartilhada é ambígua e não associa',async()=>{const b=dbMock({ambigua:true});expect(await receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).toBe(true);expect(b.rpc).not.toHaveBeenCalled();});
 it('erro registra código seguro e solicita retry',async()=>{const b=dbMock({erro:true});await expect(receberWhatsappMimo(b.db,'owner','token-teste',msg,'oi')).rejects.toThrow('mimo_recebimento_falhou');expect(b.logs).toEqual([{empresa_id:'e',vinculo_id:'v',message_id:'1',codigo:'recebimento_falhou'}]);});
 it('grupo não chama transação comercial',async()=>{const b=dbMock();await receberWhatsappMimo(b.db,'owner','token-teste',{...msg,chatid:'5511987654321@g.us'},'oi');expect(b.rpc).not.toHaveBeenCalled();});
});
