import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const EMP = "10000000-0000-4000-8000-000000000001",
  USR = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
const dados = {
  nome: "Cadastro sintético",
  whatsapp: "11999991234",
  rede: "Instagram",
  perfil: "sintetico",
  cidade: "São Paulo",
  uf: "SP",
  seguidores: 5000,
  visualizacoes: "Até 1 mil",
  nicho: "Outros",
  parceria: "Ambas as opções",
  consentimento: true,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
  CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
  CREATE TABLE public.empresa_membros(empresa_id uuid,user_id uuid,papel public.empresa_papel,ativo boolean);
  CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
  GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role; GRANT SELECT ON public.empresas TO authenticated;
  INSERT INTO public.empresas VALUES('${EMP}','mimo',true);
  INSERT INTO public.empresa_membros VALUES('${EMP}','${USR}','marketing',true);`);
  await db.exec(readFileSync("docs/migracoes-preparadas/mimo-influenciadores.sql", "utf8"));
}, 60000);
afterAll(async () => {
  await db?.close();
});
async function inscrever(payload = dados, hash = "a".repeat(64)) {
  return db.query("select public.mimo_inscrever_influenciador($1::jsonb,$2) r", [
    JSON.stringify(payload),
    hash,
  ]);
}
it("insere via serviço e torna repetição idempotente sem apagar avaliação", async () => {
  await db.exec("SET ROLE service_role");
  await inscrever();
  await inscrever();
  expect((await db.query("select * from mimo_influenciadores")).rows).toHaveLength(1);
  await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${USR}';SET ROLE authenticated`);
  expect((await db.query("select * from mimo_influenciadores")).rows).toHaveLength(1);
  await db.exec("UPDATE mimo_influenciadores SET etapa='Confirmado',notas='Avaliado'");
  expect(
    (await db.query<{ versao: number }>("select versao from mimo_influenciadores")).rows[0].versao,
  ).toBe(2);
  expect((await db.query("select * from mimo_influenciadores_historico")).rows).toHaveLength(2);
  await expect(db.exec("UPDATE mimo_influenciadores SET seguidores=999999")).rejects.toThrow();
  await expect(db.exec("DELETE FROM mimo_influenciadores_historico")).rejects.toThrow();
  await db.exec("RESET ROLE;SET ROLE service_role");
  await inscrever({ ...dados, nome: "Tentativa de sobrescrita" });
  expect(
    (await db.query<{ etapa: string }>("select etapa from mimo_influenciadores")).rows[0].etapa,
  ).toBe("Confirmado");
});
it("nega público, vendedor e membro inativo", async () => {
  await db.exec("RESET ROLE;SET ROLE anon");
  await expect(db.exec("SELECT * FROM mimo_influenciadores")).rejects.toThrow();
  await expect(inscrever()).rejects.toThrow();
  await db.exec(
    `RESET ROLE;UPDATE empresa_membros SET papel='vendedor';SET request.jwt.claim.sub='${USR}';SET ROLE authenticated`,
  );
  expect((await db.query("select * from mimo_influenciadores")).rows).toHaveLength(0);
  await db.exec(
    "RESET ROLE;UPDATE empresa_membros SET papel='marketing',ativo=false;SET ROLE authenticated",
  );
  expect((await db.query("select * from mimo_influenciadores_historico")).rows).toHaveLength(0);
});
it("limita tentativas na janela sem expor inscrições", async () => {
  await db.exec("RESET ROLE;SET ROLE service_role");
  for (let i = 0; i < 30; i++) await inscrever(dados, "b".repeat(64));
  expect((await inscrever(dados, "b".repeat(64))).rows).toEqual([{ r: "limite" }]);
});
