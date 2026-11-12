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
}, 60000);
afterAll(async () => {
  await db?.close();
});
const inscrever = (d: Record<string, unknown> = dados, h = "a".repeat(64)) =>
  db.query<{ r: string }>("SELECT mimo_inscrever_representante($1::jsonb,$2) r", [
    JSON.stringify(d),
    h,
  ]);
it("grava todas as respostas e audita somente o cadastro novo", async () => {
  await db.exec("SET ROLE service_role");
  expect((await inscrever(dados)).rows).toEqual([{ r: "recebido" }]);
  const row = (await db.query<Record<string, unknown>>("SELECT * FROM mimo_representantes"))
    .rows[0];
  for (const [k, v] of Object.entries(dados)) {
    if (k === "segmentos") expect(row[k]).toEqual(expect.arrayContaining(v as string[]));
    else expect(row[k]).toEqual(v);
  }
  expect(row.etapa).toBe("Novo");
  expect((await db.query("SELECT * FROM mimo_representantes_historico")).rows).toHaveLength(1);
});
it("bloqueia número formatado, DDI, celular antigo e e-mail com outra capitalização", async () => {
  for (const whatsapp of ["+55 (11) 99999-1234", "0055 11 99999-1234", "1199991234"]) {
    expect((await inscrever({ ...dados, whatsapp, email: "outro@example.invalid" })).rows).toEqual([
      { r: "duplicado" },
    ]);
  }
  expect(
    (await inscrever({ ...dados, email: " TESTE@EXAMPLE.INVALID ", whatsapp: "21000000000" })).rows,
  ).toEqual([{ r: "duplicado" }]);
  expect((await db.query("SELECT * FROM mimo_representantes")).rows).toHaveLength(1);
});
it("aceita apenas uma inserção em envios concorrentes", async () => {
  const r = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      inscrever(
        { ...dados, email: "concorrente@example.invalid", whatsapp: "21988881234" },
        i.toString(16).padStart(64, "0"),
      ),
    ),
  );
  expect(r.filter((v) => v.rows[0].r === "recebido")).toHaveLength(1);
  expect(r.filter((v) => v.rows[0].r === "duplicado")).toHaveLength(9);
});
it("recusa cada campo obrigatório ausente e opções inválidas no banco", async () => {
  for (const k of Object.keys(dados).filter((k) => k !== "marcas_atuais")) {
    const d: Record<string, unknown> = {
      ...dados,
      email: "incompleto@example.invalid",
      whatsapp: "21000000000",
    };
    delete d[k];
    await expect(inscrever(d)).rejects.toThrow();
  }
  await expect(
    inscrever({
      ...dados,
      email: "invalido@example.invalid",
      whatsapp: "21000000000",
      segmentos: ["invalido"],
    }),
  ).rejects.toThrow();
});
it("protege acesso, versões, histórico e exclusão sem liberar contatos duplicados", async () => {
  await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${U}';SET ROLE authenticated`);
  const r = (
    await db.query<{ id: string; versao: number }>(
      "SELECT id,versao FROM mimo_representantes WHERE email='teste@example.invalid'",
    )
  ).rows[0];
  await db.query(
    "UPDATE mimo_representantes SET etapa=$1,notas='Analisado' WHERE id=$2 AND versao=$3",
    ["Em análise", r.id, r.versao],
  );
  expect(
    (
      await db.query<{ versao: number }>("SELECT versao FROM mimo_representantes WHERE id=$1", [
        r.id,
      ])
    ).rows[0].versao,
  ).toBe(2);
  expect((await db.query("SELECT mimo_representante_excluir($1,1) ok", [r.id])).rows).toEqual([
    { ok: false },
  ]);
  expect((await db.query("SELECT mimo_representante_excluir($1,2) ok", [r.id])).rows).toEqual([
    { ok: true },
  ]);
  expect(
    (
      await db.query("SELECT * FROM mimo_representantes WHERE id=$1 AND excluido_em IS NULL", [
        r.id,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "SELECT * FROM mimo_representantes_historico WHERE representante_id=$1 AND acao='excluido' AND ator_id=$2",
        [r.id, U],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(db.query("DELETE FROM mimo_representantes WHERE id=$1", [r.id])).rejects.toThrow();
  await db.exec("RESET ROLE");
  await db.exec(readFileSync("docs/migracoes-preparadas/mimo-representantes-acesso-vendedor.sql", "utf8"));
  await db.exec("UPDATE empresa_membros SET papel='vendedor';SET ROLE authenticated");
  const candidato = (await db.query<{ id: string; versao: number }>(
    "SELECT id,versao FROM mimo_representantes WHERE excluido_em IS NULL",
  )).rows[0];
  expect(candidato).toBeTruthy();
  await db.query("UPDATE mimo_representantes SET etapa='Contatado',notas='Contato pelo vendedor' WHERE id=$1 AND versao=$2", [candidato.id, candidato.versao]);
  expect((await db.query("SELECT * FROM mimo_representantes_historico WHERE representante_id=$1 AND ator_id=$2 AND acao='avaliacao'", [candidato.id, U])).rows).toHaveLength(1);
  expect((await db.query("SELECT mimo_representante_excluir($1,$2) ok", [candidato.id, candidato.versao + 1])).rows).toEqual([{ ok: true }]);
  await db.exec("RESET ROLE;UPDATE empresa_membros SET ativo=false;SET ROLE authenticated");
  expect((await db.query("SELECT * FROM mimo_representantes")).rows).toHaveLength(0);
  await expect(db.query("SELECT mimo_representante_excluir($1,3)", [r.id])).rejects.toThrow();
  await db.exec("RESET ROLE;UPDATE empresa_membros SET ativo=true,empresa_id='10000000-0000-4000-8000-000000000099';SET ROLE authenticated");
  expect((await db.query("SELECT * FROM mimo_representantes")).rows).toHaveLength(0);
  expect((await db.query("SELECT * FROM mimo_representantes_historico")).rows).toHaveLength(0);
  await db.exec(`RESET ROLE;UPDATE empresa_membros SET empresa_id='${E}',papel='administrativo';SET ROLE authenticated`);
  expect((await db.query("SELECT * FROM mimo_representantes")).rows).toHaveLength(0);
  await expect(db.query("SELECT mimo_representante_excluir($1,3)", [r.id])).rejects.toThrow();
  await db.exec("RESET ROLE;SET ROLE anon");
  await expect(db.query("SELECT * FROM mimo_representantes")).rejects.toThrow();
  await expect(inscrever()).rejects.toThrow();
  await db.exec("RESET ROLE;SET ROLE service_role");
  expect((await inscrever()).rows).toEqual([{ r: "duplicado" }]);
});
