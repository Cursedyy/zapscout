import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll,afterAll,expect,it } from "vitest";
let db:PGlite;
const E="10000000-0000-4000-8000-000000000001",U="20000000-0000-4000-8000-000000000001",O="20000000-0000-4000-8000-000000000002",V="30000000-0000-4000-8000-000000000001";
const dados={envio_id:"40000000-0000-4000-8000-000000000001",interesse:"revenda",canal:"comecando",cidade:"Cidade sintética",uf:"RS",investimento:"sim",prazo:"agora",nome:"Pessoa sintética",whatsapp:"11999991234",consentimento:true};
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean); CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
 CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
 CREATE TABLE mimo_whatsapp_vinculos(id uuid PRIMARY KEY,empresa_id uuid,owner_id uuid,numero_comercial text,ativo boolean,finalidade text,confirmado_em timestamptz);
 CREATE TABLE mimo_agente_config(empresa_id uuid,vinculo_id uuid);
 CREATE FUNCTION mimo_normalizar_telefone(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN length(regexp_replace(t,'[^0-9]','','g')) IN(10,11) THEN '55'||regexp_replace(t,'[^0-9]','','g') ELSE regexp_replace(t,'[^0-9]','','g') END $$;
 CREATE TABLE mimo_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL,nome_empresa text NOT NULL,nome_contato text NOT NULL,telefone text,telefone_normalizado text GENERATED ALWAYS AS(mimo_normalizar_telefone(telefone)) STORED,perfil text,origem text,campanha_origem text,anuncio_origem text,observacoes text,created_by uuid NOT NULL,etapa text DEFAULT 'novo',responsavel_id uuid,valor_pedido numeric);
 CREATE UNIQUE INDEX ON mimo_leads(empresa_id,telefone_normalizado) WHERE telefone_normalizado IS NOT NULL;
 CREATE FUNCTION pode_ver_mimo_lead(l uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM mimo_leads WHERE id=l AND tem_papel_empresa(empresa_id,u,ARRAY['administrador','gestor','vendedor','administrativo']::empresa_papel[])) $$;
 INSERT INTO empresas VALUES('${E}','mimo',true);INSERT INTO empresa_membros VALUES('${E}','${U}','vendedor',true);
 INSERT INTO mimo_whatsapp_vinculos VALUES('${V}','${E}','${U}','555391280424',true,'entrada',now());INSERT INTO mimo_agente_config VALUES('${E}','${V}');
 ALTER TABLE mimo_whatsapp_vinculos ADD COLUMN token_sha256 text DEFAULT 'hash-sintetico', ADD COLUMN confirmado_por uuid DEFAULT '${O}';
 INSERT INTO empresa_membros VALUES('${E}','${O}','administrador',true);
 ALTER TABLE mimo_leads ADD COLUMN entrada_em timestamptz DEFAULT now(),ADD COLUMN primeiro_contato_whatsapp_em timestamptz,ADD COLUMN ultimo_contato_whatsapp_em timestamptz;
 CREATE TABLE mimo_whatsapp_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid,vinculo_id uuid,message_id text,direcao text,texto text,contato_em timestamptz,lead_id uuid,UNIQUE(vinculo_id,message_id));
 CREATE FUNCTION mimo_comercial_telefone_interno(e uuid,n text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 GRANT USAGE ON SCHEMA public,auth TO service_role,authenticated,anon; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;GRANT SELECT ON mimo_leads TO authenticated;`);
 const helper=readFileSync("docs/migracoes-preparadas/mimo-influenciadores-duplicidade.sql","utf8").match(/CREATE FUNCTION public\.mimo_influenciador_telefone[\s\S]*?END \$\$;/)![0];await db.exec(helper);
 await db.exec(readFileSync("docs/migracoes-preparadas/mimo-revenda-formulario.sql","utf8"));
 await db.exec(readFileSync("docs/migracoes-preparadas/mimo-revenda-whatsapp-vinculo.sql","utf8"));await db.exec("SET ROLE service_role");
},60000);
afterAll(async()=>{await db?.close();});
const inscrever=async(d:Record<string,unknown>=dados,h="a".repeat(64))=>(await db.query<{r:{estado:string;numero?:string}}>("SELECT mimo_inscrever_revenda($1::jsonb,$2) r",[JSON.stringify(d),h])).rows[0].r;
it("grava respostas, mínimo fixo e um lead; retries concorrentes não duplicam",async()=>{
 const resultados=await Promise.all(Array.from({length:4},()=>inscrever()));expect(resultados.every(r=>r.estado==="recebido")).toBe(true);
 expect((await db.query("SELECT * FROM mimo_leads")).rows).toHaveLength(1);
 const fichas=(await db.query<{minimo_centavos:number;respostas:Record<string,unknown>}>("SELECT * FROM mimo_revenda_inscricoes")).rows;
 expect(fichas).toHaveLength(1);expect(fichas[0].minimo_centavos).toBe(150000);expect(fichas[0].respostas.canal).toBe("comecando");
 expect((await db.query<{quantidade:number}>("SELECT quantidade FROM mimo_revenda_limites")).rows[0].quantidade).toBe(1);
 expect(await inscrever({...dados,nome:"Alterado"})).toEqual({estado:"conflito"});
});
it("novo envio do mesmo telefone preserva o cadastro e as decisões comerciais",async()=>{
 await db.exec(`UPDATE mimo_leads SET etapa='em_negociacao',observacoes='Nota da equipe',responsavel_id='${U}',valor_pedido=777`);
 expect((await inscrever({...dados,envio_id:crypto.randomUUID(),nome:"Outro nome",whatsapp:"+55 (11) 99999-1234",responsavel_id:O,minimo_centavos:1})).estado).toBe("recebido");
 const leads=(await db.query<{etapa:string;observacoes:string;valor_pedido:string}>("SELECT * FROM mimo_leads")).rows;
 expect(leads).toHaveLength(1);expect(leads[0].observacoes).toBe("Nota da equipe");expect(leads[0].etapa).toBe("em_negociacao");expect(Number(leads[0].valor_pedido)).toBe(777);
});
it("vincula a entrada do WhatsApp com número antigo ao cadastro do formulário",async()=>{
 const r=await db.query<{id:string}>("SELECT mimo_revenda_lead_por_telefone($1,$2) id",[E,"551199991234"]);
 expect(r.rows[0].id).toBe((await db.query<{id:string}>("SELECT id FROM mimo_leads LIMIT 1")).rows[0].id);
 expect((await db.query<{id:string|null}>("SELECT mimo_revenda_lead_por_telefone($1,$2) id",[O,"551199991234"])).rows[0].id).toBeNull();
 const receber=()=>db.query<{id:string}>("SELECT mimo_receber_whatsapp_comercial($1,$2,'hash-sintetico','evento-sintetico',$3,'Nome no WhatsApp','Quero falar com um consultor',now(),false) id",[V,U,"551199991234"]);
 expect((await receber()).rows[0].id).toBe(r.rows[0].id);expect((await receber()).rows[0].id).toBe(r.rows[0].id);
 expect((await db.query("SELECT * FROM mimo_leads")).rows).toHaveLength(1);expect((await db.query("SELECT * FROM mimo_whatsapp_eventos")).rows).toHaveLength(1);
});
it("reutiliza lead antigo sem nono dígito quando recebe um novo formulário",async()=>{
 await db.exec(`INSERT INTO mimo_leads(empresa_id,nome_empresa,nome_contato,telefone,created_by,observacoes) VALUES('${E}','Lead antigo','Antigo','555188881234','${U}','Preservar')`);
 expect((await inscrever({...dados,envio_id:crypto.randomUUID(),whatsapp:"51988881234"},"d".repeat(64))).estado).toBe("recebido");
 expect((await db.query("SELECT * FROM mimo_leads WHERE telefone_normalizado IN ('555188881234','5551988881234')")).rows).toHaveLength(1);
});
it("o próprio banco rejeita não compradores e dados inválidos",async()=>{
 for(const change of [{interesse:"representante"},{investimento:"nao"},{consentimento:false},{uf:"XX"},{nome:""},{whatsapp:null},{envio_id:null},{site:"spam"}]) await expect(inscrever({...dados,...change,envio_id:change.envio_id===null?null:crypto.randomUUID()})).rejects.toThrow();
 expect((await db.query("SELECT * FROM mimo_revenda_inscricoes")).rows).toHaveLength(3);
});
it("limita abuso por IP e por telefone, sem impedir retry já confirmado",async()=>{
 expect((await inscrever({...dados,envio_id:crypto.randomUUID()})).estado).toBe("recebido");
 expect((await inscrever({...dados,envio_id:crypto.randomUUID()},"b".repeat(64))).estado).toBe("limite");
 for(let i=0;i<10;i++) expect((await inscrever({...dados,envio_id:crypto.randomUUID(),whatsapp:`2198888${String(i).padStart(4,"0")}`},"c".repeat(64))).estado).toBe("recebido");
 expect((await inscrever({...dados,envio_id:crypto.randomUUID(),whatsapp:"31999991234"},"c".repeat(64))).estado).toBe("limite");
 expect((await inscrever()).estado).toBe("recebido");
});
it("anon e usuários não gravam via RPC; RLS isola equipe comercial e dados internos",async()=>{
 await db.exec("RESET ROLE; SET ROLE anon");await expect(inscrever()).rejects.toThrow("permission denied");await expect(db.query("SELECT * FROM mimo_revenda_inscricoes")).rejects.toThrow();
 await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${U}',false)`);
 expect((await db.query("SELECT * FROM mimo_revenda_inscricoes")).rows.length).toBeGreaterThan(0);await expect(inscrever()).rejects.toThrow("permission denied");await expect(db.exec("DELETE FROM mimo_revenda_inscricoes")).rejects.toThrow();await expect(db.query("SELECT * FROM mimo_revenda_limites")).rejects.toThrow();
 await db.exec(`SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000099',false)`);expect((await db.query("SELECT * FROM mimo_revenda_inscricoes")).rows).toHaveLength(0);
 await db.exec(`RESET ROLE; UPDATE empresa_membros SET papel='administrativo' WHERE user_id='${U}'; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${U}',false)`);expect((await db.query("SELECT * FROM mimo_revenda_inscricoes")).rows).toHaveLength(0);
 await db.exec("RESET ROLE; SET ROLE service_role");
});

