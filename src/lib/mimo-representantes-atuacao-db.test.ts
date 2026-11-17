import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const E = "10000000-0000-4000-8000-000000000001",
  U = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
const dados = {
  nome: "Representante sintético",
  email: "teste@example.invalid",
  whatsapp: "11999991234",
  cidade: "São Paulo",
  uf: "SP",
  regiao_atuacao: "Grande São Paulo",
  experiencia: "mais3",
  segmentos: ["produtos_naturais", "farmacias"],
  carteira_clientes: 200,
  marcas_atuais: "Marca sintética",
  core: "ativo",
  disponibilidade: "imediata",
  motivacao: "Quero ampliar o acesso a alimentos saudáveis na minha região.",
  consentimento: true,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
 CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;GRANT SELECT ON empresas TO authenticated;
 INSERT INTO empresas VALUES('${E}','mimo',true);INSERT INTO empresa_membros VALUES('${E}','${U}','marketing',true);`);
  const helper = readFileSync(
    "docs/migracoes-preparadas/mimo-influenciadores-duplicidade.sql",
    "utf8",
  ).match(/CREATE FUNCTION public\.mimo_influenciador_telefone[\s\S]*?END \$\$;/)![0];
  await db.exec(helper);
  const sql = readFileSync("docs/migracoes-preparadas/mimo-representantes.sql", "utf8");
  expect(sql).toMatch(/^[\x00-\x7F]*$/);
  await db.exec(sql);
  await db.exec(
    readFileSync("docs/migracoes-preparadas/mimo-representantes-motivacao.sql", "utf8"),
  );
  await db.exec(readFileSync("docs/migracoes-preparadas/mimo-representantes-atuacao-efetiva.sql", "utf8"));
}, 60000);
afterAll(async () => {
  await db?.close();
});
const inscrever = (d: Record<string, unknown> = dados, h = "a".repeat(64)) =>
  db.query<{ r: string }>("SELECT mimo_inscrever_representante($1::jsonb,$2) r", [
    JSON.stringify(d),
    h,
  ]);

it("salva atuação efetiva sem inventar carteira ou disponibilidade e preserva cadastro anterior",async()=>{
 await db.exec("SET ROLE service_role");
 expect((await inscrever()).rows).toEqual([{r:"recebido"}]);
 const novo={...dados,email:"novo@example.invalid",whatsapp:"21999999999",segmentos:["alimentar","distribuicao","emporios","casas_especializadas","farma"],principais_clientes:"Cliente Exemplo — Alimentar",marcas_atuais:"Marca Exemplo — 4 anos"} as Record<string,unknown>;
 delete novo.carteira_clientes;delete novo.disponibilidade;
 expect((await inscrever(novo)).rows).toEqual([{r:"recebido"}]);
 expect((await db.query("SELECT principais_clientes,carteira_clientes,disponibilidade,marcas_atuais FROM mimo_representantes WHERE email='novo@example.invalid'")).rows).toEqual([{principais_clientes:novo.principais_clientes,carteira_clientes:null,disponibilidade:null,marcas_atuais:novo.marcas_atuais}]);
 expect((await db.query("SELECT principais_clientes,carteira_clientes,disponibilidade,segmentos FROM mimo_representantes WHERE email='teste@example.invalid'")).rows).toEqual([{principais_clientes:null,carteira_clientes:200,disponibilidade:"imediata",segmentos:expect.arrayContaining(["produtos_naturais","farmacias"])}]);
 expect((await inscrever(novo)).rows).toEqual([{r:"duplicado"}]);
 for(const principais_clientes of [undefined," ","a".repeat(2001)]){
  await expect(inscrever({...novo,email:"invalido@example.invalid",whatsapp:"31999999999",principais_clientes})).rejects.toThrow();
 }
 await db.exec("RESET ROLE;SET ROLE anon");
 await expect(db.query("SELECT principais_clientes FROM mimo_representantes")).rejects.toThrow("permission denied");
 await expect(inscrever(novo)).rejects.toThrow("permission denied");
 await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${U}';SET ROLE authenticated`);
 expect((await db.query("SELECT principais_clientes FROM mimo_representantes WHERE email='novo@example.invalid'")).rows).toEqual([{principais_clientes:novo.principais_clientes}]);
 await expect(db.exec("UPDATE mimo_representantes SET principais_clientes='Outra resposta'")).rejects.toThrow("permission denied");
});
