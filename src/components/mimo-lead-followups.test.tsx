// @vitest-environment happy-dom
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const f=vi.hoisted(()=>({ler:vi.fn(),salvar:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/mimo-comercial.functions',()=>({followupsMimo:f.ler,alterarFollowupMimo:f.salvar}));
import { FollowupsLeadMimo } from './mimo-lead-followups';
const U='10000000-0000-4000-8000-000000000001', L='10000000-0000-4000-8000-000000000002';
let client:QueryClient;
beforeEach(()=>{vi.resetAllMocks();client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});});
afterEach(()=>{cleanup();client.clear();});
function mount(lead=true,onOpen?: (id:string)=>void){render(<QueryClientProvider client={client}><FollowupsLeadMimo usuarioId={U} leadId={lead?L:undefined} membros={{[U]:'Você'}} onOpen={onOpen}/></QueryClientProvider>);}
it('capacidade ausente não mostra zero pendências nem permite salvar',async()=>{f.ler.mockResolvedValue({disponivel:false,motivo:'Estrutura não ativada'});mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Hoje')).toBeNull();expect((screen.getByRole('button',{name:'Agendar'}) as HTMLButtonElement).disabled).toBe(true);});
it('erro de consulta permite recuperação sem mostrar contagens prontas',async()=>{f.ler.mockRejectedValueOnce(Error('offline')).mockResolvedValue({disponivel:true,itens:[],historico:[]});mount();fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));expect(await screen.findByText('Nenhum follow-up neste filtro.')).toBeTruthy();expect(f.ler).toHaveBeenCalledTimes(2);});
it('falha ao salvar preserva campos e retry não duplica operação',async()=>{
  f.ler.mockResolvedValue({disponivel:true,itens:[],historico:[]});f.salvar.mockRejectedValue(Error('Ainda não ativado'));mount();
  const button=await screen.findByRole('button',{name:'Agendar'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
  fireEvent.change(screen.getByLabelText('Data e hora do follow-up'),{target:{value:'2026-11-19T09:30'}});fireEvent.change(screen.getByLabelText('Observação do follow-up'),{target:{value:'Revisar proposta'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar follow-up'}));expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByLabelText('Observação do follow-up') as HTMLTextAreaElement).value).toBe('Revisar proposta');
  const first=f.salvar.mock.calls[0][0].data;expect(first.prazo).toBe('2026-11-19T12:30:00.000Z');
  fireEvent.click(screen.getByRole('button',{name:'Salvar follow-up'}));await waitFor(()=>expect(f.salvar).toHaveBeenCalledTimes(2));expect(f.salvar.mock.calls[1][0].data.operacao_id).toBe(first.operacao_id);
});
it('duplo clique enquanto resposta está pendente chama gravação uma vez',async()=>{
  f.ler.mockResolvedValue({disponivel:true,itens:[],historico:[]});f.salvar.mockReturnValue(new Promise(()=>{}));mount();
  const button=await screen.findByRole('button',{name:'Agendar'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
  fireEvent.change(screen.getByLabelText('Data e hora do follow-up'),{target:{value:'2026-11-19T09:30'}});fireEvent.change(screen.getByLabelText('Observação do follow-up'),{target:{value:'Revisar'}});
  const save=screen.getByRole('button',{name:'Salvar follow-up'});fireEvent.click(save);fireEvent.click(save);await waitFor(()=>expect(f.salvar).toHaveBeenCalledTimes(1));
});
it('lista acionável abre lead autorizado; encerrados não entram no filtro padrão',async()=>{
  const item={id:U,lead_id:L,responsavel_id:U,prazo:'2026-11-19T12:00:00Z',observacao:'Pendente sintético',estado:'pendente',versao:1};f.ler.mockResolvedValue({disponivel:true,itens:[item,{...item,id:L,estado:'concluido',observacao:'Encerrado'}],historico:[]});const open=vi.fn();mount(false,open);
  fireEvent.click(await screen.findByRole('button',{name:'Abrir lead'}));expect(open).toHaveBeenCalledWith(L);expect(screen.queryByText('Encerrado')).toBeNull();
});