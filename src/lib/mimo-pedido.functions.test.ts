import { beforeEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({papel:'administrador',lead:true,pedido:true,adminCalls:0,versao:1}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(h:unknown)=>h};return b;}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@/lib/mimo-leads.server',()=>({exigirMimo:async()=>({empresaId:'empresa',usuarioId:'ator',papel:state.papel})}));
vi.mock('@/lib/mimo-pedido-db',()=>({tiraClient:(c:unknown)=>c}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:async(_nome:string,args:Record<string,unknown>)=>{state.adminCalls++;return {data:{id:'pedido',args},error:null};}}}));
import { configurarTiraMimo, receberPedidoMimo, salvarPedidoMimo } from '@/lib/mimo-pedido.functions';
import { CATALOGO, MODELOS, carregarModelo, novoPedido } from '@/lib/mimo-pedido';

function db(){return {from:(table:string)=>{const q={select:()=>q,eq:()=>q,single:async()=>table==='mimo_leads'?{data:state.lead?{id:'lead',nome_empresa:'Cliente',responsavel_id:'ator'}:null,error:state.lead?null:{code:'42501'}}:{data:state.pedido?{id:'pedido',lead_id:'lead',versao:state.versao,pix:null}:null,error:state.pedido?null:{code:'42501'}}};return q;}};}
type Call=(v:{data:unknown;context:{supabase:unknown;userId:string}})=>Promise<unknown>;
const call=(fn:unknown,data:unknown)=>(fn as Call)({data,context:{supabase:db(),userId:'ator'}});
beforeEach(()=>{state.papel='administrador';state.lead=true;state.pedido=true;state.adminCalls=0;state.versao=1;});
describe('fronteira autenticada dos pedidos',()=>{
  it('nega configurar por vendedor antes de carregar cliente privilegiado',async()=>{state.papel='vendedor';await expect(call(configurarTiraMimo,{catalogo:CATALOGO,modelos:MODELOS,taxas:Array(12).fill(313),versao:null})).rejects.toThrow();expect(state.adminCalls).toBe(0);});
  it('nega recebimento quando pedido não é visível pela RLS',async()=>{state.pedido=false;await expect(call(receberPedidoMimo,{id:'pedido',versao:1,operacao:'op',valor:100})).rejects.toThrow();expect(state.adminCalls).toBe(0);});
  it('nega recebimento quando lead não é visível',async()=>{state.lead=false;await expect(call(receberPedidoMimo,{id:'pedido',versao:1,operacao:'op',valor:100})).rejects.toThrow();expect(state.adminCalls).toBe(0);});
  it('nega recebimento concorrente antes do RPC',async()=>{state.versao=2;await expect(call(receberPedidoMimo,{id:'pedido',versao:1,operacao:'op',valor:100})).rejects.toThrow();expect(state.adminCalls).toBe(0);});
  it('recebimento autorizado chama a operação atômica',async()=>{await call(receberPedidoMimo,{id:'pedido',versao:1,operacao:'op',valor:100});expect(state.adminCalls).toBe(1);});
  it('salvar rascunho requer lead visível',async()=>{state.lead=false;const m=MODELOS[0];if(!m)throw new Error('modelo ausente');await expect(call(salvarPedidoMimo,{id:'pedido',versao:0,pedido:{...novoPedido(),leadId:'00000000-0000-4000-8000-000000000001',itens:carregarModelo(m,CATALOGO)}})).rejects.toThrow();expect(state.adminCalls).toBe(0);});
});