import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
const E='10000000-0000-4000-8000-000000000001',O='10000000-0000-4000-8000-000000000002';
const A='20000000-0000-4000-8000-000000000001',V='20000000-0000-4000-8000-000000000002',C='20000000-0000-4000-8000-000000000003',I='20000000-0000-4000-8000-000000000004',M='20000000-0000-4000-8000-000000000005',D='20000000-0000-4000-8000-000000000006',N='20000000-0000-4000-8000-000000000007';
const B='30000000-0000-4000-8000-000000000001',F='30000000-0000-4000-8000-000000000002';
let db:PGlite;let lead:string;
const sql=(file:string)=>readFileSync(file,'utf8');
const user=async(id:string,role='authenticated')=>db.exec(`RESET ROLE;SET app.uid='${id}';SET ROLE ${role};`);
const receive=async(binding:string,id:string,phone:string,from=false)=>{
 await user(A,'service_role');return (await db.query<{r:string}>('SELECT fixture_receber($1,$2,repeat($3,64),$4,$5,$6,$7,clock_timestamp(),$8) r',[binding,A,binding===B?'a':'b',id,phone,'Sintético','Contato sintético',from])).rows[0].r;
};
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
 CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
 CREATE TABLE empresa_membros(id uuid DEFAULT gen_random_uuid(),empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
 CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p))$$;
 CREATE FUNCTION is_membro_empresa(e uuid,u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo)$$;
 CREATE FUNCTION empresa_papel_de(e uuid,u uuid) RETURNS empresa_papel LANGUAGE sql SECURITY DEFINER AS $$SELECT papel FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo$$;
 INSERT INTO empresas VALUES('${E}','mimo',true),('${O}','outra',true);
 INSERT INTO empresa_membros(empresa_id,user_id,papel,ativo) VALUES('${E}','${A}','administrador',true),('${E}','${V}','vendedor',true),('${E}','${C}','vendedor',true),('${E}','${I}','vendedor',false),('${E}','${M}','marketing',true),('${E}','${D}','administrativo',true),('${O}','${N}','vendedor',true);
 CREATE TABLE profiles(id uuid,uazapi_instance_token text,nome text);
 CREATE TABLE uazapi_instancias(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,tipo text CONSTRAINT uazapi_instancias_tipo_check CHECK(tipo IN ('prospeccao','secundaria','principal','pool')),nome text,token text,status text,UNIQUE(user_id,tipo));
 INSERT INTO uazapi_instancias(user_id,tipo,nome,status) VALUES('${A}','principal','Legado sintético','connected'),('${A}','pool','Pool sintético','disconnected');
 `);
 await db.exec(sql('drizzle/migrations/0008_mimo_leads_comerciais.sql'));
 await db.exec(sql('drizzle/migrations/0009_mimo_whatsapp_recebimento.sql'));
 await db.exec(sql('drizzle/migrations/0011_mimo_restringe_leads_vendedor.sql'));
 // Exact production role/priority guard definitions, without unrelated Meta import function.
 await db.exec(sql('drizzle/migrations/0016_mimo_cargos_marketing_administrativo.sql').split('CREATE OR REPLACE FUNCTION public.mimo_importar_meta_ads')[0]);
 await db.exec(sql('drizzle/migrations/0013_mimo_perdas_duplicados_prioridade.sql'));
 await db.exec(`ALTER FUNCTION mimo_receber_whatsapp(uuid,uuid,text,text,text,text,text,timestamptz,boolean) RENAME TO mimo_receber_whatsapp_comercial;
 ALTER TABLE mimo_whatsapp_eventos ADD COLUMN referencia_anuncio jsonb;
 CREATE TABLE mimo_tira_pedidos(id uuid PRIMARY KEY,empresa_id uuid,lead_id uuid,status text,total bigint);
 CREATE TABLE mimo_tira_versoes(empresa_id uuid,pedido_id uuid,created_at timestamptz,snapshot jsonb);
 `);
 await db.exec(sql('docs/migracoes-preparadas/mimo-comercial-compartilhado.sql'));
 await db.exec(sql('docs/migracoes-preparadas/mimo-lead-followups.sql'));
 await db.exec(sql('docs/migracoes-preparadas/mimo-comercial-numeros-avisos.sql'));
 await db.exec(sql('docs/migracoes-preparadas/mimo-followup-avisos-worker.sql'));
 await db.exec(`CREATE FUNCTION fixture_receber(_b uuid,_a uuid,_h text,_i text,_t text,_n text,_txt text,_em timestamptz,_me boolean) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$SELECT mimo_receber_whatsapp_comercial(_b,_a,_h,_i,_t,_n,_txt,_em,_me)$$;
 REVOKE ALL ON FUNCTION fixture_receber(uuid,uuid,text,text,text,text,text,timestamptz,boolean) FROM PUBLIC;GRANT EXECUTE ON FUNCTION fixture_receber(uuid,uuid,text,text,text,text,text,timestamptz,boolean) TO service_role;`);
 await db.exec(`INSERT INTO mimo_whatsapp_vinculos(id,empresa_id,owner_id,numero_comercial,token_sha256,ativo,confirmado_por,finalidade)
 VALUES('${B}','${E}','${A}','551188880001',repeat('a',64),true,'${A}','entrada'),('${F}','${E}','${A}','551188880002',repeat('b',64),true,'${A}','fechamento');`);
 lead=await receive(B,'primeiro','551199990001');
 await db.exec(`RESET ROLE;UPDATE mimo_leads SET responsavel_id='${V}' WHERE id='${lead}';`);
},60000);
afterAll(async()=>{await db?.close();});
it('preserva conexões principal/pool legadas ao adicionar os tipos comerciais',async()=>{
 await db.exec('RESET ROLE');
 expect((await db.query<{tipo:string}>("SELECT tipo FROM uazapi_instancias WHERE tipo IN ('principal','pool') ORDER BY tipo")).rows.map(x=>x.tipo)).toEqual(['pool','principal']);
});
it('números internos em outro binding não criam cliente nem alcançam o piloto',async()=>{
 expect(await receive(B,'interno-core','551188880002')).toBeNull();
 await user(A,'service_role');
 expect((await db.query<{r:string|null}>("SELECT mimo_receber_whatsapp($1,$2,repeat('a',64),'interno-wrapper','551188880002','Equipe','Aviso interno',clock_timestamp(),false) r",[B,A])).rows[0].r).toBeNull();
 await db.exec('RESET ROLE');
 expect((await db.query("SELECT id FROM mimo_whatsapp_eventos WHERE message_id LIKE 'interno-%'")).rows).toHaveLength(0);
 expect((await db.query("SELECT id FROM mimo_leads WHERE telefone_normalizado='551188880002'")).rows).toHaveLength(0);
});
it('aceita destino interno em outro binding comercial, mas bloqueia o próprio remetente',async()=>{
 await user(A);
 await expect(db.query('SELECT mimo_follow_aviso_configurar($1,$2::jsonb)',[E,JSON.stringify({membro:V,vinculo:B,numero:'551188880001',confirmado:true,versao:0})])).rejects.toThrow('remetente');
 expect((await db.query<{r:number}>('SELECT mimo_follow_aviso_configurar($1,$2::jsonb) r',[E,JSON.stringify({membro:V,vinculo:B,numero:'551188880002',confirmado:true,versao:0})])).rows[0].r).toBe(1);
});
it('colega ativo lê/edita histórico e conversa, prioridade/reatribuição continuam bloqueadas',async()=>{
 await user(C);expect((await db.query('SELECT id FROM mimo_leads WHERE id=$1',[lead])).rows).toHaveLength(1);
 const equipe=(await db.query<{user_id:string;papel:string;nome:string}>('SELECT * FROM mimo_comercial_responsaveis($1)',[E])).rows;
 expect(new Set(equipe.map(m=>m.user_id))).toEqual(new Set([A,V,C]));
 expect(Object.keys(equipe[0]).sort()).toEqual(['nome','papel','user_id']);
 await db.query('UPDATE mimo_leads SET observacoes=$1 WHERE id=$2',['Edição sintética por colega',lead]);
 expect((await db.query('SELECT id FROM mimo_lead_historico WHERE lead_id=$1',[lead])).rows.length).toBeGreaterThan(0);
 expect((await db.query('SELECT id FROM mimo_whatsapp_eventos WHERE lead_id=$1',[lead])).rows).toHaveLength(1);
 await expect(db.query('UPDATE mimo_leads SET responsavel_id=$1 WHERE id=$2',[C,lead])).rejects.toThrow('reatribuir');
 await expect(db.query("UPDATE mimo_leads SET prioridade_revisada='alta' WHERE id=$1",[lead])).rejects.toThrow('prioridade');
});
it.each([I,M,N])('inativo marketing ou outra empresa não leem leads (%s)',async id=>{
 await user(id);expect((await db.query('SELECT id FROM mimo_leads')).rows).toHaveLength(0);
 await expect(db.query('SELECT * FROM mimo_comercial_responsaveis($1)',[E])).rejects.toThrow('Acesso negado');
 expect((await db.query('SELECT id FROM mimo_whatsapp_eventos')).rows).toHaveLength(0);
});
it('administrativo preserva leitura operacional sem escrita',async()=>{await user(D);expect((await db.query('SELECT id FROM mimo_leads WHERE id=$1',[lead])).rows).toHaveLength(1);expect((await db.query("UPDATE mimo_leads SET observacoes='forjado' WHERE id=$1 RETURNING id",[lead])).rows).toHaveLength(0);});
it('pedido de colega autorizado via RPC seguro, gestão/inativo/outro company negados',async()=>{
 await user(C,'service_role');expect((await db.query<{r:string}>('SELECT mimo_tira_ator($1,$2,$3,false) r',[E,C,lead])).rows[0].r).toBe('vendedor');
 for(const args of [[E,C,lead,true],[E,I,lead,false],[O,C,lead,false],[E,M,lead,false]])await expect(db.query('SELECT mimo_tira_ator($1,$2,$3,$4)',args)).rejects.toThrow('acesso negado');
 await user(C);await expect(db.query('SELECT mimo_tira_ator($1,$2,$3,false)',[E,C,lead])).rejects.toThrow();
});
it('fechamento não cria lead; mesmo telefone em vários bindings associa e deduplica',async()=>{
 expect(await receive(F,'desconhecido','551199990002')).toBeNull();
 expect(await receive(F,'fechamento','551199990001')).toBe(lead);
 expect(await receive(F,'fechamento','551199990001')).toBe(lead);
 expect(await receive(B,'enviada','551199990001',true)).toBe(lead);
 await db.exec('RESET ROLE');expect((await db.query("SELECT id FROM mimo_leads WHERE telefone_normalizado='551199990002'")).rows).toHaveLength(0);
 expect((await db.query("SELECT id FROM mimo_whatsapp_eventos WHERE vinculo_id=$1 AND message_id='fechamento'",[F])).rows).toHaveLength(1);
});
it('evidência de anúncio aparece em lead novo de entrada sem CSV; legado permanece',async()=>{
 const novo=await receive(B,'adnovo','551199990003');await db.exec('RESET ROLE');
 await db.query("UPDATE mimo_whatsapp_eventos SET referencia_anuncio=$1::jsonb WHERE message_id='adnovo'",[JSON.stringify({id:'ad-sintetico',url:'https://facebook.com/ad',fonte:'metadado_whatsapp'})]);
 expect((await db.query('SELECT origem,anuncio_origem FROM mimo_leads WHERE id=$1',[novo])).rows[0]).toEqual({origem:'meta_ads',anuncio_origem:'ad-sintetico'});
 await db.query("UPDATE mimo_whatsapp_eventos SET referencia_anuncio=$1::jsonb WHERE message_id='fechamento'",[JSON.stringify({id:'ad-sintetico',url:'https://facebook.com/ad',fonte:'metadado_whatsapp'})]);
 expect((await db.query('SELECT origem FROM mimo_leads WHERE id=$1',[lead])).rows[0]).toEqual({origem:'whatsapp'});
});
it('fila destinatário segue follow-up e versões cancelam anteriores; kill-switch não autoriza envio',async()=>{
 await user(A);const config={membro:C,vinculo:B,numero:'551199990099',versao:0,confirmado:true};
 const configRpc=()=>db.query<{r:number}>('SELECT mimo_follow_aviso_configurar($1,$2::jsonb) r',[E,JSON.stringify(config)]);
 expect((await configRpc()).rows[0].r).toBe(1);await expect(configRpc()).rejects.toThrow('Versão alterada');
 const data={id:crypto.randomUUID(),lead_id:lead,responsavel_id:C,prazo:'2026-11-19T12:00:00Z',observacao:'Sintético',versao:0,acao:'agendar',operacao_id:crypto.randomUUID()};
 const rpc=()=>db.query('SELECT mimo_lead_followup_operar($1,$2::jsonb)',[E,JSON.stringify(data)]);
 await user(V);await rpc();await rpc();await db.exec('RESET ROLE');
 let rows=(await db.query<{id:string;destinatario_id:string;estado:string}>('SELECT id,destinatario_id,estado FROM mimo_follow_aviso_fila WHERE follow_id=$1',[data.id])).rows;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({destinatario_id:C,estado:'bloqueada'});
 await user(A,'service_role');expect((await db.query<{r:unknown}>('SELECT mimo_follow_aviso_precheck($1) r',[rows[0].id])).rows[0].r).toMatchObject({elegivel:true,envioAutorizado:false});
 await user(V);data.acao='reagendar';data.versao=1;data.operacao_id=crypto.randomUUID();await rpc();
 await db.exec('RESET ROLE');rows=(await db.query<{id:string;destinatario_id:string;estado:string}>('SELECT id,destinatario_id,estado FROM mimo_follow_aviso_fila WHERE follow_id=$1 ORDER BY follow_versao',[data.id])).rows;
 expect(rows.map(r=>r.estado)).toEqual(['cancelada','bloqueada']);
 await user(C);data.acao='concluir';data.versao=2;data.operacao_id=crypto.randomUUID();await rpc();
 await db.exec('RESET ROLE');expect((await db.query("SELECT id FROM mimo_follow_aviso_fila WHERE follow_id=$1 AND estado='bloqueada'",[data.id])).rows).toHaveLength(0);
});
it('configuração rejeita cliente, membro inativo e papel impedido',async()=>{
 await user(A);for(const change of [{membro:I},{membro:M},{numero:'551199990001'}])await expect(db.query('SELECT mimo_follow_aviso_configurar($1,$2::jsonb)',[E,JSON.stringify({membro:V,vinculo:B,numero:'551199990098',confirmado:true,versao:0,...change})])).rejects.toThrow();
 await user(V);await expect(db.query('SELECT mimo_follow_aviso_configurar($1,$2::jsonb)',[E,JSON.stringify({membro:V,vinculo:B,numero:'551199990098',confirmado:true,versao:0})])).rejects.toThrow('Acesso negado');
});
it('worker exige ativação, respeita cutoff e reserva uma única vez sem retry de envio incerto',async()=>{
 await user(A);
 const c=(await db.query<{versao:number}>('SELECT versao FROM mimo_follow_aviso_config WHERE empresa_id=$1 AND membro_id=$2',[E,C])).rows[0];
 await expect(db.query('SELECT mimo_follow_aviso_ativar($1,$2,$3,true)',[E,C,c.versao+1])).rejects.toThrow('Versão alterada');
 await user(V);await expect(db.query('SELECT mimo_follow_aviso_ativar($1,$2,$3,true)',[E,C,c.versao])).rejects.toThrow('Acesso negado');
 const make=async(prazo:string)=>{const d={id:crypto.randomUUID(),lead_id:lead,responsavel_id:C,prazo,observacao:'Aviso sintético',versao:0,acao:'agendar',operacao_id:crypto.randomUUID()};await user(A);await db.query('SELECT mimo_lead_followup_operar($1,$2::jsonb)',[E,JSON.stringify(d)]);return d;};
 await make(new Date(Date.now()-60000).toISOString());
 await user(A,'service_role');expect((await db.query<{r:unknown}>('SELECT to_jsonb(mimo_follow_aviso_reservar()) r')).rows[0].r).toBeNull();
 await user(A);await db.query('SELECT mimo_follow_aviso_ativar($1,$2,$3,true)',[E,C,c.versao]);
 await user(A,'service_role');expect((await db.query<{r:unknown}>('SELECT to_jsonb(mimo_follow_aviso_reservar()) r')).rows[0].r).toBeNull();
 const fresh=await make(new Date(Date.now()+1000).toISOString());await new Promise(resolve=>setTimeout(resolve,1100));
 await user(A,'service_role');const q=(await db.query<{r:{id:string;reserva:string;follow_id:string}}>('SELECT to_jsonb(mimo_follow_aviso_reservar()) r')).rows[0].r;
 expect(q.follow_id).toBe(fresh.id);expect((await db.query<{r:unknown}>('SELECT to_jsonb(mimo_follow_aviso_reservar()) r')).rows[0].r).toBeNull();
 expect((await db.query<{r:boolean}>('SELECT mimo_follow_aviso_autorizar($1,$2) r',[q.id,crypto.randomUUID()])).rows[0].r).toBe(false);
 expect((await db.query<{r:boolean}>('SELECT mimo_follow_aviso_autorizar($1,$2) r',[q.id,q.reserva])).rows[0].r).toBe(true);
 await db.exec('RESET ROLE');await db.query("UPDATE mimo_follow_aviso_fila SET reservada_em=clock_timestamp()-interval '6 minutes' WHERE id=$1",[q.id]);
 await user(A,'service_role');await db.query('SELECT mimo_follow_aviso_reservar()');
 await db.exec('RESET ROLE');expect((await db.query<{estado:string}>('SELECT estado FROM mimo_follow_aviso_fila WHERE id=$1',[q.id])).rows[0].estado).toBe('incerta');
 await user(A,'service_role');expect((await db.query<{r:unknown}>('SELECT to_jsonb(mimo_follow_aviso_reservar()) r')).rows[0].r).toBeNull();
 expect((await db.query<{r:boolean}>('SELECT mimo_follow_aviso_finalizar($1,$2,true,$3) r',[q.id,q.reserva,'aceite-tardio-sintetico'])).rows[0].r).toBe(true);
});
it('RPCs de envio são exclusivas do serviço',async()=>{await user(A);await expect(db.query('SELECT mimo_follow_aviso_reservar()')).rejects.toThrow('permission denied');});
