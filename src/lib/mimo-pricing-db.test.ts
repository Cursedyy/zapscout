import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import seed from "@/lib/__fixtures__/mimo-pricing.json";
it("pricing: RLS, cargos, empresas, versões, importação e histórico atômico", async () => {
  const db = new PGlite();
  const emp = "10000000-0000-4000-8000-000000000001",
    other = "10000000-0000-4000-8000-000000000002";
  const ids = Array.from({ length: 6 }, (_, i) => `20000000-0000-4000-8000-00000000000${i + 1}`);
  const user = (id: string) =>
    db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
  const dados = {
    nome: "Teste",
    cliente: null as string | null,
    uf: "",
    linhas: seed.linhas,
    politicas: [],
  };
  const rpc = async (
    id: string | null = null,
    versao = 0,
    hash: string | null = null,
    empresa = emp,
    d = dados,
  ) =>
    (
      await db.query<{ id: string }>("select public.mimo_pricing_salvar($1,$2,$3,$4,$5,$6,$7) id", [
        empresa,
        id,
        versao,
        "base",
        JSON.stringify(d),
        hash,
        "Planilha",
      ])
    ).rows[0].id;
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated;CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
 CREATE TABLE mimo_carteira_unidades(id uuid PRIMARY KEY,empresa_id uuid);
 CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
 GRANT SELECT ON empresas TO authenticated;
 INSERT INTO empresas VALUES('${emp}','mimo',true),('${other}','outra',true);
 INSERT INTO auth.users VALUES ${ids.map((i) => `('${i}')`).join(",")};
 INSERT INTO empresa_membros VALUES ${ids
   .slice(0, 5)
   .map(
     (i, k) =>
       `('${emp}','${i}','${["administrador", "gestor", "vendedor", "marketing", "administrativo"][k]}',true)`,
   )
   .join(",")},('${other}','${ids[5]}','administrador',true);`);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-pricing.sql", "utf8"));
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-pricing-origens.sql", "utf8"));
    await db.query(
      "insert into mimo_pricing_origens(empresa_id,hash,origem,dados) values($1,$2,$3,$4)",
      [emp, "fixture-source", "fixture.xlsx", JSON.stringify(dados)],
    );
    await user(ids[0]);
    expect((await db.query("select * from mimo_pricing_origens")).rows).toHaveLength(1);
    await expect(db.exec("delete from mimo_pricing_origens")).rejects.toThrow();
    const id = await rpc(null, 0, "hash-inicial");
    expect((await db.query("select * from mimo_pricing_documentos")).rows).toHaveLength(1);
    await expect(rpc(id, 1, "hash-inicial")).rejects.toThrow("Arquivo já importado");
    await user(ids[1]);
    await rpc(id, 1);
    await expect(rpc(id, 1)).rejects.toThrow("Estudo alterado");
    expect((await db.query("select * from mimo_pricing_historico")).rows).toHaveLength(2);
    await expect(db.exec("update mimo_pricing_documentos set versao=99")).rejects.toThrow();
    await expect(db.exec("delete from mimo_pricing_historico")).rejects.toThrow();
    for (const uid of ids.slice(2)) {
      await user(uid);
      expect((await db.query("select * from mimo_pricing_origens")).rows).toHaveLength(0);
      expect((await db.query("select * from mimo_pricing_documentos")).rows).toHaveLength(0);
      expect((await db.query("select * from mimo_pricing_historico")).rows).toHaveLength(0);
      await expect(rpc(id, 2)).rejects.toThrow("Acesso negado");
    }
    await user(ids[0]);
    await expect(rpc(null, 0, null, other)).rejects.toThrow();
    await expect(
      rpc(id, 2, null, emp, { ...dados, linhas: [seed.linhas[0], seed.linhas[0]] }),
    ).rejects.toThrow("duplicado");
    await expect(
      rpc(id, 2, null, emp, { ...dados, cliente: ids[5] } as typeof dados),
    ).rejects.toThrow("Cliente");
    expect(
      (await db.query<{ versao: number }>("select versao from mimo_pricing_documentos")).rows[0]
        .versao,
    ).toBe(2);
  } finally {
    await db.close();
  }
}, 60000);
