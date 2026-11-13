import { beforeEach,it,expect,vi } from 'vitest';
const f=vi.hoisted(()=>({exigir:vi.fn(),rpc:vi.fn(),lead:vi.fn(),read:vi.fn()}));
vi.mock('./mimo-leads.server',()=>({exigirMimo:f.exigir}));
import { lerFollowups,operarFollowup,exigirComercial } from './mimo-comercial.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { FollowInput } from './mimo-comercial';
function query(end:()=>unknown){const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>end(),maybeSingle:()=>end()};return q;}
const db={from:(name:string)=>query(name==='mimo_leads'?f.lead:f.read),rpc:f.rpc} as unknown as SupabaseClient<Database>;
beforeEach(()=>{vi.resetAllMocks();f.exigir.mockResolvedValue({empresaId:'company',papel:'vendedor',usuarioId:'ator'});f.lead.mockResolvedValue({data:{id:'lead',responsavel_id:'ator'},error:null});});
it.each(['marketing','administrativo'])('%s não lê ou escreve comercial',async papel=>{f.exigir.mockResolvedValue({empresaId:'company',papel});await expect(lerFollowups(db,'ator')).rejects.toThrow('Acesso negado');expect(f.read).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();});
it('vendedor colega não lê detalhe nem grava',async()=>{f.lead.mockResolvedValue({data:{responsavel_id:'colega'}});await expect(exigirComercial(db,'ator','lead')).rejects.toThrow('acesso atual');expect(f.rpc).not.toHaveBeenCalled();});
it('schema ausente retorna estado inequívoco e nenhuma contagem',async()=>{f.read.mockResolvedValue({data:null,error:{code:'42P01'}});const r=await lerFollowups(db,'ator');expect(r.disponivel).toBe(false);expect('itens' in r).toBe(false);});
it('erro de rede não é confundido com banco vazio',async()=>{f.read.mockResolvedValue({data:null,error:{code:'NETWORK'}});await expect(lerFollowups(db,'ator')).rejects.toThrow('contagens indisponíveis');});
it('RPC ausente recusa gravação explicitamente',async()=>{f.rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}});await expect(operarFollowup(db,'ator',{lead_id:'lead',responsavel_id:'ator'} as FollowInput)).rejects.toThrow('Nenhum agendamento foi salvo');});
it('conflito de versão exige revisão e não finge salvar',async()=>{f.rpc.mockResolvedValue({data:null,error:{code:'40001'}});await expect(operarFollowup(db,'ator',{lead_id:'lead',responsavel_id:'ator'} as FollowInput)).rejects.toThrow('mudou');});