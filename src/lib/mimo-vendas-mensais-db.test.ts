import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const empresa = "00000000-0000-4000-8000-000000000001";
const gerente = "00000000-0000-4000-8000-000000000002";
const vendedor = "00000000-0000-4000-8000-000000000003";
const registro = { total: { orcado: 6000 }, semanas: [{ numero: 1, dias: [
  { data: "2025-01-02", realizado: 100 }, { data: "2025-01-03", realizado: 200 },
] }] };
let db: PGlite;
async function entrar(id: string) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function editar(dia: string | null, esperado: number, valor: number) {
  const r = await db.query<{ ajustes: Record<string, number> }>(
    "SELECT public.mimo_vendas_definir_valor($1,'2025-01-01',$2,$3,$4)->'ajustes' AS ajustes",
    [empresa, dia, esperado, valor]);
  return r.rows[0].ajustes;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TYPE public.empresa_papel AS ENUM ('administrador','gestor','vendedor');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.empresas(id uuid PRIMARY KEY, slug text, ativa boolean);
    CREATE TABLE public.empresa_membros(empresa_id uuid, user_id uuid, papel public.empresa_papel, ativo boolean);
    CREATE FUNCTION public.tem_papel_empresa(uuid,uuid,public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=$1 AND user_id=$2 AND papel=ANY($3) AND ativo) $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON empresas,empresa_membros TO authenticated;`);
  for (const nome of ["0059_mimo_vendas_mensais", "0060_mimo_vendas_edicao"]) {
    await db.exec(await readFile("drizzle/migrations/" + nome + ".sql", "utf8"));
  }
  await db.query("INSERT INTO empresas VALUES ($1,'mimo',true)", [empresa]);
  await db.query("INSERT INTO empresa_membros VALUES ($1,$2,'gestor',true), ($1,$3,'vendedor',true)", [empresa, gerente, vendedor]);
  await db.query("INSERT INTO mimo_vendas_mensais(empresa_id,competencia,demonstrativo) VALUES ($1,'2025-01-01',$2)", [empresa, JSON.stringify(registro)]);
  await db.exec("SET ROLE authenticated");
}, 30000);
afterAll(async () => { await db?.close(); });

it("preserva os outros lançamentos, permite repetição e detecta conflito no mesmo campo", async () => {
  await entrar(gerente);
  expect(await editar("2025-01-02", 100, 120)).toEqual({ "2025-01-02": 120 });
  expect(await editar("2025-01-02", 100, 120)).toEqual({ "2025-01-02": 120 });
  await editar("2025-01-03", 200, 0);
  await expect(editar("2025-01-02", 100, 101)).rejects.toMatchObject({ code: "40001" });
  expect(await editar(null, 6000, 2500)).toEqual({ meta: 2500, "2025-01-02": 120, "2025-01-03": 0 });
  expect(await editar("2025-01-02", 120, 100)).toEqual({ meta: 2500, "2025-01-03": 0 });
  const original = await db.query("SELECT demonstrativo FROM mimo_vendas_mensais");
  expect(original.rows[0]).toEqual({ demonstrativo: registro });
});

it("bloqueia gravação direta, datas e valores inválidos e usuários sem permissão", async () => {
  await entrar(gerente);
  await expect(db.exec("UPDATE mimo_vendas_mensais SET ajustes='{}'")).rejects.toMatchObject({ code: "42501" });
  await expect(editar("2025-02-01", 0, 100)).rejects.toMatchObject({ code: "22023" });
  await expect(editar("2025-01-31", 0, 100)).rejects.toMatchObject({ code: "P0002" });
  await expect(editar(null, 6000, -1)).rejects.toMatchObject({ code: "22023" });
  for (const id of [vendedor, ""]) {
    await entrar(id);
    await expect(editar(null, 6000, 10000)).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("SELECT * FROM mimo_vendas_mensais")).rows).toEqual([]);
  }
  await db.exec("RESET ROLE; SET ROLE anon");
  await expect(editar(null, 6000, 10000)).rejects.toMatchObject({ code: "42501" });
});
