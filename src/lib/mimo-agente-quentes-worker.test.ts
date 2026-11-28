import { beforeEach, expect, it, vi } from "vitest";
const fichaRevenda = vi.hoisted(() => vi.fn());
vi.mock('./mimo-agente-revenda.server',()=>({lerFichaRevendaAgente:fichaRevenda}));
it('entrega encaminhamento sem sinal quente com contexto do cliente',async()=>{
 const anterior=f.rpc.getMockImplementation()!;
 f.rpc.mockImplementation(async(nome,p)=>p._acao==='reservar_alerta'?{error:null,data:{...fila,tipo:'lead',nome:'Contato sintético',telefone:'5511999999999',sinal:{quente:false,motivos:['encaminhamento_equipe'],evidencias:[{evento:'sintetico',trecho:'Preciso saber os ingredientes.'}]}}}:anterior(nome,p));
 expect(await executarObservacaoMimo()).toBe('aceita');
 expect(f.grupoEnviar).toHaveBeenCalledWith('token-privado',expect.anything(),expect.stringContaining('Preciso saber os ingredientes'));
 expect(f.individual).not.toHaveBeenCalled();
});
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
it("usa o contexto devolvido pela reserva e inclui a ficha do lead", async () => {
  const anterior = f.rpc.getMockImplementation()!;
  const lead = "10000000-0000-4000-8000-000000000001";
  f.rpc.mockImplementation(async (nome, p) => p._acao === "reservar_alerta"
    ? { error: null, data: { ...fila, tipo: "lead", nome: "Cadastro", telefone: "5511999999999",
        lead_id: lead,
        sinal: { quente: false, motivos: ["encaminhamento_equipe"], evidencias: [] },
        dados_encaminhamento: {
          nome: { valor: "Pessoa sintética", evidencia: "Meu nome é Pessoa sintética" },
          necessidade: { valor: "valor inicial", evidencia: "Qual é o valor inicial?" },
        } } }
    : anterior(nome, p));
  expect(await executarObservacaoMimo()).toBe("aceita");
  const texto = f.grupoEnviar.mock.calls[0][2];
  expect(texto).toContain("Cliente: Pessoa sintética");
  expect(texto).toContain("Pergunta do cliente: “Qual é o valor inicial?”");
  expect(texto).toContain("https://zapscout.com.br/mimo/leads?lead=" + lead);
  expect(f.grupoEnviar).toHaveBeenCalledTimes(1);
});

it("contexto complementar inválido preserva o envio autorizado com a dúvida registrada", async () => {
  const anterior = f.rpc.getMockImplementation()!;
  f.rpc.mockImplementation(async (nome, p) => p._acao === "reservar_alerta"
    ? { error: null, data: { ...fila, tipo: "lead", nome: "Cadastro", telefone: "5511999999999",
        dados_encaminhamento: { nome: ["inválido"] }, sinal: { quente: false, motivos: ["encaminhamento_equipe"],
          evidencias: [{ evento: "origem", trecho: "Qual o pedido mínimo?" }] } } }
    : anterior(nome, p));
  expect(await executarObservacaoMimo()).toBe("aceita");
  expect(f.grupoEnviar).toHaveBeenCalledExactlyOnceWith(
    "token-privado", expect.anything(), expect.stringContaining("Pergunta do cliente: “Qual o pedido mínimo?”"),
  );
});

it('acrescenta todos os dados da ficha ao aviso durável sem nova classificação',async()=>{
 const anterior=f.rpc.getMockImplementation()!;
 f.rpc.mockImplementation(async(nome,p)=>p._acao==='reservar_alerta'?{error:null,data:{...fila,tipo:'lead',nome:'Teste',telefone:'5511999999999',sinal:{quente:false,motivos:['encaminhamento_equipe'],evidencias:[]}}}:anterior(nome,p));
 fichaRevenda.mockResolvedValue({id:'ficha',preenchidoEm:new Date().toISOString(),minimoCentavos:100000,respostas:{nome:'Pessoa Teste',cidade:'Cidade Teste',uf:'RS',canal:'comecando',prazo:'pesquisando'}});
 expect(await executarObservacaoMimo()).toBe('aceita');
 const texto=f.grupoEnviar.mock.calls[0][2];
 for(const trecho of ['Pessoa Teste','Cidade Teste/RS','Estou começando','R$ 1.000,00','Ainda estou pesquisando','Não comprova compra']) expect(texto).toContain(trecho);
 expect(fichaRevenda).toHaveBeenCalledWith('empresa','5511999999999');
 expect(f.grupoEnviar).toHaveBeenCalledTimes(1);
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
