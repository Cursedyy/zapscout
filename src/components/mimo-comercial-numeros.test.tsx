// @vitest-environment happy-dom
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {it,expect,vi,afterEach} from 'vitest';
const f=vi.hoisted(()=>({painel:vi.fn(),operar:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/mimo-comercial-v2.functions',()=>({painelNumerosMimo:f.painel,consultarAuxiliarMimo:f.operar,parearAuxiliarMimo:f.operar,criarAuxiliarMimo:f.operar,confirmarNumeroAuxiliarMimo:f.operar,configurarAvisosMimo:f.operar,ativarAvisosMimo:f.operar}));
import {MimoComercialNumeros} from './mimo-comercial-numeros';
afterEach(()=>{cleanup();vi.resetAllMocks();});
const mount=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MimoComercialNumeros/></QueryClientProvider>);
it('schema pendente não permite parear/criar/vincular nem finge avisos ativos',async()=>{f.painel.mockResolvedValue({disponivel:false,motivo:'Configuração pendente: não ativada.'});mount();expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByRole('button',{name:'Criar auxiliar separada'})).toBeNull();expect(f.operar).not.toHaveBeenCalled();});
it('falha de leitura oferece recuperação sem operações provider',async()=>{f.painel.mockRejectedValueOnce(Error('rede')).mockResolvedValue({disponivel:false,motivo:'Configuração pendente'});mount();fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));expect(await screen.findByText('Configuração pendente')).toBeTruthy();expect(f.operar).not.toHaveBeenCalled();});
