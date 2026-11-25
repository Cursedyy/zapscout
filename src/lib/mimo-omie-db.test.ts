import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const empresa = "10000000-0000-4000-8000-000000000001";
const outra = "10000000-0000-4000-8000-000000000002";
const ator = "20000000-0000-4000-8000-000000000001";
const gestor = "20000000-0000-4000-8000-000000000002";
const vendedor = "20000000-0000-4000-8000-000000000003";
const versao = "a".repeat(64);
const mudancas = [{ itemId: 1, anterior: "5.102", novo: "6.102" }];

it("audita simulações atomicamente, restringe empresa/ator e bloqueia escrita direta e repetições", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid STABLE LANGUAGE sql AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
      CREATE TYPE public.empresa_papel AS ENUM ('administrador','gestor','vendedor','marketing','administrativo');
      CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
      CREATE TABLE public.empresa_membros(empresa_id uuid,user_id uuid,papel public.empresa_papel,ativo boolean);
      GRANT SELECT ON public.empresas TO authenticated;
      INSERT INTO public.empresas VALUES ('${empresa}','mimo',true),('${outra}','outra',true);
      INSERT INTO auth.users VALUES ('${ator}'),('${gestor}'),('${vendedor}');
      INSERT INTO public.empresa_membros VALUES ('${empresa}','${ator}','administrador',true),('${empresa}','${gestor}','gestor',true),('${empresa}','${vendedor}','vendedor',true),('${outra}','${ator}','administrador',true);
    `);
    const base = readFileSync("drizzle/migrations/0007_mimo_base_acesso.sql", "utf8");
    await db.exec(
      base.slice(
        base.indexOf("CREATE OR REPLACE FUNCTION public.empresa_papel_de"),
        base.indexOf("-- empresas: membros leem"),
      ),
    );
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-omie-cfop-simulacao.sql", "utf8"));
    const preparar = async (user = ator, company = empresa, changes: unknown = mudancas) => {
      const r = await db.query<{ id: string }>(
        "SELECT public.mimo_omie_preparar($1,$2,123,$3,$4::jsonb) AS id",
        [company, user, versao, JSON.stringify(changes)],
      );
      return r.rows[0].id;
    };
    const confirmar = async (id: string, user = ator, hash = versao) => {
      const r = await db.query<{ estado: string }>(
        "SELECT public.mimo_omie_confirmar($1,$2,$3,$4) AS estado",
        [empresa, user, id, hash],
      );
      return r.rows[0].estado;
    };
    await db.exec("SET ROLE service_role");
    const id = await preparar();
    await expect(preparar(vendedor)).rejects.toThrow(/Acesso negado/);
    await expect(preparar(ator, outra)).rejects.toThrow(/Acesso negado/);
    await expect(preparar(ator, empresa, [...mudancas, ...mudancas])).rejects.toThrow(/duplicado/);
    await expect(
      preparar(ator, empresa, [{ ...mudancas[0], segredo: "nao-permitido" }]),
    ).rejects.toThrow(/invalida/);
    await expect(confirmar(id, gestor)).rejects.toThrow(/Acesso negado/);
    expect(await confirmar(id)).toBe("simulada");
    expect(await confirmar(id)).toBe("simulada");
    const obsoleta = await preparar();
    expect(await confirmar(obsoleta, ator, "b".repeat(64))).toBe("obsoleta");
    expect(await confirmar(obsoleta)).toBe("obsoleta");
    const expirada = await preparar();
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE public.mimo_omie_previas SET expira_em=now()-interval '1 minute' WHERE id=$1",
      [expirada],
    );
    await db.exec("SET ROLE service_role");
    expect(await confirmar(expirada)).toBe("expirada");
    await db.exec("RESET ROLE");
    const auditoria = await db.query<{ resultado: string; mudancas: unknown }>(
      "SELECT resultado,mudancas FROM public.mimo_omie_auditoria WHERE previa_id=$1 ORDER BY created_at",
      [id],
    );
    expect(auditoria.rows).toEqual([
      { resultado: "previa", mudancas },
      { resultado: "simulada", mudancas },
    ]);
    await expect(
      db.exec("UPDATE public.mimo_omie_auditoria SET resultado='obsoleta'"),
    ).rejects.toThrow(/imutavel/);
    await db.query("SELECT set_config('app.uid',$1,false)", [ator]);
    await db.exec("SET ROLE authenticated");
    expect((await db.query("SELECT id FROM public.mimo_omie_previas")).rows).toHaveLength(3);
    await expect(preparar()).rejects.toThrow(/permission denied/);
    await expect(confirmar(id)).rejects.toThrow(/permission denied/);
    await expect(db.exec("DELETE FROM public.mimo_omie_auditoria")).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.exec("UPDATE public.mimo_omie_previas SET estado='simulada'")).rejects.toThrow(
      /permission denied/,
    );
    await db.query("SELECT set_config('app.uid',$1,false)", [vendedor]);
    expect((await db.query("SELECT id FROM public.mimo_omie_previas")).rows).toEqual([]);
    expect((await db.query("SELECT id FROM public.mimo_omie_auditoria")).rows).toEqual([]);
    await db.exec("RESET ROLE; SET ROLE service_role");
    const pendente = await preparar();
    await db.exec(
      `RESET ROLE; UPDATE public.empresa_membros SET ativo=false WHERE user_id='${ator}' AND empresa_id='${empresa}'; SET ROLE service_role`,
    );
    await expect(confirmar(pendente)).rejects.toThrow(/Acesso negado/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(db.exec("SELECT * FROM public.mimo_omie_previas")).rejects.toThrow(
      /permission denied/,
    );
    await expect(preparar()).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});
