import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const E='10000000-0000-4000-8000-000000000001', OTHER='10000000-0000-4000-8000-000000000002';
const A='20000000-0000-4000-8000-000000000001', V='20000000-0000-4000-8000-000000000002', C='20000000-0000-4000-8000-000000000003', M='20000000-0000-4000-8000-000000000004', D='20000000-0000-4000-8000-000000000005', I='20000000-0000-4000-8000-000000000006', NONE='20000000-0000-4000-8000-000000000007', G='20000000-0000-4000-8000-000000000008';
const L='30000000-0000-4000-8000-000000000001', OL='30000000-0000-4000-8000-000000000002';
let db:PGlite;
const user=async(id:string)=>db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
const input=()=>({id:crypto.randomUUID(),lead_id:L,operacao_id:crypto.randomUUID(),versao:0,acao:'agendar',responsavel_id:V,prazo:'2026-11-19T12:00:00Z',observacao:'Revisar proposta sintética'});
type Row={id:string;versao:number;estado:string;prazo:string};
const rpc=async(data:unknown,empresa=E)=>(await db.query<{r:Row}>('SELECT to_jsonb(public.mimo_lead_followup_operar($1::uuid,$2::jsonb)) r',[empresa,JSON.stringify(data)])).rows[0].r;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA auth,public TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
  CREATE TABLE public.empresa_membros(empresa_id uuid,user_id uuid,papel text,ativo boolean,PRIMARY KEY(empresa_id,user_id));
  CREATE TABLE public.mimo_leads(id uuid PRIMARY KEY,empresa_id uuid,responsavel_id uuid,valor_pedido numeric,conversao_em timestamptz);
  CREATE FUNCTION public.pode_ver_mimo_lead(l uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.mimo_leads x JOIN public.empresa_membros m ON m.empresa_id=x.empresa_id WHERE x.id=l AND m.user_id=u AND m.ativo AND (m.papel IN ('administrador','gestor') OR (m.papel='vendedor' AND x.responsavel_id=u))) $$;
  INSERT INTO public.empresas VALUES('${E}','mimo',true),('${OTHER}','outra',true);
  INSERT INTO public.empresa_membros VALUES('${E}','${A}','administrador',true),('${E}','${V}','vendedor',true),('${E}','${C}','vendedor',true),('${E}','${M}','marketing',true),('${E}','${D}','administrativo',true),('${E}','${I}','vendedor',false),('${E}','${G}','gestor',true),('${OTHER}','${A}','administrador',true);
  INSERT INTO public.mimo_leads VALUES('${L}','${E}','${V}',NULL,NULL),('${OL}','${OTHER}','${A}',NULL,NULL);
  `);await db.exec(readFileSync('docs/migracoes-preparadas/mimo-lead-followups.sql','utf8'));
},60000);
afterAll(async()=>{await db?.close();});
it('vendedor autorizado agenda; RLS oculta para colega e escrita direta é negada',async()=>{
  await user(V);const r=await rpc(input());expect(r.versao).toBe(1);
  expect((await db.query('SELECT id FROM public.mimo_lead_followups WHERE id=$1',[r.id])).rows).toHaveLength(1);
  await expect(db.query('UPDATE public.mimo_lead_followups SET observacao=$1 WHERE id=$2',['forjado',r.id])).rejects.toThrow();
  await user(C);expect((await db.query('SELECT id FROM public.mimo_lead_followups')).rows).toHaveLength(0);
  expect((await db.query('SELECT id FROM public.mimo_lead_followup_historico')).rows).toHaveLength(0);
  await expect(rpc(input())).rejects.toThrow('Acesso negado');
});
it.each([NONE,I,M,D])('sem vínculo/ inativo/ papel impedido não lê nem opera (%s)',async id=>{
  await user(id);expect((await db.query('SELECT id FROM public.mimo_lead_followups')).rows).toHaveLength(0);await expect(rpc(input())).rejects.toThrow('Acesso negado');
});
it('outra empresa e lead de outra empresa são negados mesmo para administrador',async()=>{await user(A);await expect(rpc({...input(),lead_id:OL},OTHER)).rejects.toThrow('Acesso negado');await expect(rpc({...input(),lead_id:OL})).rejects.toThrow('Acesso negado');});
it.each([C,I,M,D,NONE])('responsável sem autorização atual é rejeitado (%s)',async id=>{await user(A);await expect(rpc({...input(),responsavel_id:id})).rejects.toThrow('Acesso negado');});
it('gestor gerencia e retries idênticos são idempotentes, payload alterado não',async()=>{await user(G);const data=input();const a=await rpc(data);const b=await rpc(data);expect(b.id).toBe(a.id);expect(b.versao).toBe(1);expect((await db.query('SELECT id FROM public.mimo_lead_followup_historico WHERE follow_id=$1',[a.id])).rows).toHaveLength(1);await expect(rpc({...data,observacao:'Outra'})).rejects.toThrow('Operação reutilizada');});
it('atualização otimista recusa segundo escritor com a mesma versão',async()=>{
  await user(A);const data=input();const a=await rpc(data);
  const update={...data,versao:a.versao,acao:'reagendar',prazo:'2026-11-20T12:00:00Z',operacao_id:crypto.randomUUID()};
  const b=await rpc(update);expect(b.versao).toBe(2);expect(b.estado).toBe('pendente');
  await expect(rpc({...update,operacao_id:crypto.randomUUID()})).rejects.toThrow('Versão alterada');
});
it.each(['concluir','cancelar'])('transição %s é terminal e auditada',async acao=>{
  await user(A);const data=input();const a=await rpc(data);const b=await rpc({...data,versao:a.versao,acao,operacao_id:crypto.randomUUID()});
  expect(b.estado).toBe(acao==='concluir'?'concluido':'cancelado');
  await expect(rpc({...data,versao:b.versao,acao:'reagendar',operacao_id:crypto.randomUUID()})).rejects.toThrow('Follow-up encerrado');
  expect((await db.query('SELECT id FROM public.mimo_lead_followup_historico WHERE follow_id=$1',[a.id])).rows).toHaveLength(2);
  await expect(db.exec('DELETE FROM public.mimo_lead_followup_historico')).rejects.toThrow();
});
it.each(['infinity','2026-02-30T12:00:00Z','invalid',null])('datas inválidas são negadas no RPC (%s)',async prazo=>{await user(A);await expect(rpc({...input(),prazo})).rejects.toThrow();});
it('limites/ação/versão não podem ser forjados',async()=>{await user(A);for(const change of [{observacao:''},{observacao:'x'.repeat(501)},{acao:'reabrir'},{versao:-1}]) await expect(rpc({...input(),...change})).rejects.toThrow('Campos inválidos');});
it('reassignment removes read/write and does not copy totals into legacy fields',async()=>{
  await user(A);const data=input();await rpc(data);await db.exec(`RESET ROLE;UPDATE public.mimo_leads SET responsavel_id='${C}' WHERE id='${L}';`);
  await user(V);expect((await db.query('SELECT id FROM public.mimo_lead_followups')).rows).toHaveLength(0);await expect(rpc(input())).rejects.toThrow('Acesso negado');
  await db.exec('RESET ROLE');expect((await db.query('SELECT valor_pedido,conversao_em FROM public.mimo_leads WHERE id=$1',[L])).rows[0]).toEqual({valor_pedido:null,conversao_em:null});
});