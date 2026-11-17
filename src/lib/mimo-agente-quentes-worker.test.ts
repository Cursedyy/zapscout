import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({rpc:vi.fn(),remetente:vi.fn(),listar:vi.fn(),confirmar:vi.fn(),grupoEnviar:vi.fn(),individual:vi.fn()}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:f.rpc}}));
vi.mock('./mimo-agente-worker.server',()=>({obterRemetenteAgente:f.remetente}));
vi.mock('./uazapi.server',()=>({uazSendText:f.individual,uazLocalizarGrupoQuentes:f.listar,uazConfirmarGrupoQuentes:f.confirmar,uazEnviarGrupoQuentes:f.grupoEnviar}));
import {executarObservacaoMimo} from './mimo-agente-quentes-worker.server';
const jid='120363000000000001@g.us';
const pedido={empresa:'empresa',vinculo:'vinculo',versao:2,status:'pendente'};
const fila={id:'alerta',reserva:'reserva',empresa_id:'empresa',vinculo_id:'vinculo',config_versao:3,destino:jid,tipo:'teste'};
beforeEach(()=>{
 vi.resetAllMocks();f.remetente.mockResolvedValue('token-privado');f.listar.mockResolvedValue(jid);f.confirmar.mockResolvedValue({jid,nome:'Leads Quentes 🔥'});f.grupoEnviar.mockResolvedValue({id:'aceite'});
 f.rpc.mockImplementation(async(nome:string,p:{_acao:string})=>({error:null,data:nome==='mimo_quentes_grupo'?(p._acao==='consultar'?pedido:true):p._acao==='reservar_alerta'?fila:p._acao==='reservar_analise'?null:true}));
});
it('descobre, confirma, testa o grupo e só ativa após o aceite persistido',async()=>{
 expect(await executarObservacaoMimo()).toBe('aceita');
 expect(f.grupoEnviar).toHaveBeenCalledExactlyOnceWith('token-privado',{jid,nome:'Leads Quentes 🔥'},expect.stringContaining('Nenhum lead antigo'));
 expect(f.individual).not.toHaveBeenCalled();
 const acoes=f.rpc.mock.calls.map(([nome,p])=>`${nome}:${p._acao}`);
 expect(acoes.indexOf('mimo_quentes_grupo:confirmar')).toBeLessThan(acoes.indexOf('mimo_quentes_operar:autorizar_alerta'));
 expect(acoes.indexOf('mimo_quentes_operar:finalizar_alerta')).toBeLessThan(acoes.indexOf('mimo_quentes_grupo:ativar'));
 expect(f.confirmar).toHaveBeenCalledTimes(2);
});
it('não escolhe nem envia quando o grupo não é encontrado',async()=>{
 f.listar.mockRejectedValue(Error('grupo_quentes_nao_encontrado'));
 expect(await executarObservacaoMimo()).toBe('grupo_pendente');
 expect(f.rpc).toHaveBeenCalledWith('mimo_quentes_grupo',{_acao:'diagnostico',_p:{empresa:'empresa',versao:2,erro:'grupo_quentes_nao_encontrado'}});
 expect(f.grupoEnviar).not.toHaveBeenCalled();expect(f.individual).not.toHaveBeenCalled();
});
it('autorização cancelada não envia ao grupo nem ativa os avisos',async()=>{
 const anterior=f.rpc.getMockImplementation()!;
 f.rpc.mockImplementation(async(nome,p)=>p._acao==='autorizar_alerta'?{error:null,data:false}:anterior(nome,p));
 expect(await executarObservacaoMimo()).toBe('cancelada');expect(f.grupoEnviar).not.toHaveBeenCalled();
 expect(f.rpc.mock.calls.some(([,p])=>p._acao==='ativar')).toBe(false);
});
it('aceite perdido permanece incerto sem ativar ou repetir',async()=>{
 f.grupoEnviar.mockRejectedValue(Error('timeout'));
 expect(await executarObservacaoMimo()).toBe('incerta');
 expect(f.grupoEnviar).toHaveBeenCalledTimes(1);
 expect(f.rpc).toHaveBeenCalledWith('mimo_quentes_operar',{_acao:'finalizar_alerta',_p:{id:'alerta',reserva:'reserva',message_id:null}});
 expect(f.rpc.mock.calls.some(([,p])=>p._acao==='ativar')).toBe(false);
});
