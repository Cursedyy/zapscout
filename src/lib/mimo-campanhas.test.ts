import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { campanhaMimoSchema, situacaoCampanha } from "./mimo-campanhas";

const campanha = {
  nome: "Promoção de novembro",
  inicio: "2026-11-01",
  fim: "2026-11-30",
  produtos: "Kit comercial",
  condicoes: "R$ 99,00 à vista",
  status: "publicada" as const,
};
it("valida vigência real, condições para publicar e versão ao editar", () => {
  expect(campanhaMimoSchema.safeParse(campanha).success).toBe(true);
  for (const dados of [
    { ...campanha, fim: "2026-10-31" },
    { ...campanha, inicio: "2026-02-30" },
    { ...campanha, condicoes: "" },
    { ...campanha, id: "30000000-0000-4000-8000-000000000001" },
  ])
    expect(campanhaMimoSchema.safeParse(dados).success).toBe(false);
  expect(
    campanhaMimoSchema.safeParse({ ...campanha, status: "rascunho", produtos: "", condicoes: "" })
      .success,
  ).toBe(true);
});
it("inclui os dois dias da vigência e distingue campanhas programadas e encerradas", () => {
  expect(situacaoCampanha(campanha, "2026-10-31")).toBe("Programada");
  expect(situacaoCampanha(campanha, "2026-11-01")).toBe("Em vigor");
  expect(situacaoCampanha(campanha, "2026-11-30")).toBe("Em vigor");
  expect(situacaoCampanha(campanha, "2026-12-01")).toBe("Encerrada");
});
describe("campanhas: permissões no PostgreSQL", () => {
  it("isola empresas, protege rascunhos, impede escrita de vendedor e preserva edição concorrente", async () => {
    const db = new PGlite();
    const empresa = "10000000-0000-4000-8000-000000000001",
      outra = "10000000-0000-4000-8000-000000000002";
    const admin = "20000000-0000-4000-8000-000000000001",
      vendedor = "20000000-0000-4000-8000-000000000002",
      externo = "20000000-0000-4000-8000-000000000003";
    const user = (id: string) =>
      db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
        GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
        CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','marketing','vendedor');
        CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean); CREATE TABLE public.empresa_membros(empresa_id uuid,user_id uuid,papel public.empresa_papel,ativo boolean);
        CREATE FUNCTION public.is_membro_empresa(e uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo) $$;
        CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
        GRANT SELECT ON public.empresas TO authenticated;
        INSERT INTO auth.users VALUES('${admin}'),('${vendedor}'),('${externo}');
        INSERT INTO public.empresas VALUES('${empresa}','mimo',true),('${outra}','outra',true);
        INSERT INTO public.empresa_membros VALUES('${empresa}','${admin}','administrador',true),('${empresa}','${vendedor}','vendedor',true),('${outra}','${externo}','administrador',true);`);
      await db.exec(
        readFileSync("docs/migracoes-preparadas/mimo-campanhas-comerciais.sql", "utf8"),
      );
      await user(admin);
      const insert = `INSERT INTO public.mimo_campanhas_comerciais(empresa_id,nome,inicio,fim,produtos,condicoes,status) VALUES($1,'Promoção','2026-11-01','2026-11-30','Kit','R$ 99',$2) RETURNING id`;
      const id = (await db.query<{ id: string }>(insert, [empresa, "publicada"])).rows[0].id;
      await db.query(insert, [empresa, "rascunho"]);
      await user(vendedor);
      expect((await db.query("SELECT * FROM public.mimo_campanhas_comerciais")).rows).toHaveLength(
        1,
      );
      await expect(db.query(insert, [empresa, "publicada"])).rejects.toThrow();
      expect(
        (await db.query("UPDATE public.mimo_campanhas_comerciais SET nome='Alterada' RETURNING id"))
          .rows,
      ).toHaveLength(0);
      await user(externo);
      expect((await db.query("SELECT * FROM public.mimo_campanhas_comerciais")).rows).toHaveLength(
        0,
      );
      await expect(db.query(insert, [outra, "publicada"])).rejects.toThrow();
      await user(admin);
      const atualizado = await db.query<{ versao: number; updated_by: string }>(
        "UPDATE public.mimo_campanhas_comerciais SET nome='Atualizada' WHERE id=$1 AND versao=1 RETURNING versao,updated_by",
        [id],
      );
      expect(atualizado.rows[0]).toEqual({ versao: 2, updated_by: admin });
      expect(
        (
          await db.query(
            "UPDATE public.mimo_campanhas_comerciais SET nome='Obsoleta' WHERE id=$1 AND versao=1 RETURNING id",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        db.query("UPDATE public.mimo_campanhas_comerciais SET empresa_id=$1 WHERE id=$2", [
          outra,
          id,
        ]),
      ).rejects.toThrow();
      await expect(
        db.query("UPDATE public.mimo_campanhas_comerciais SET fim='2026-10-01' WHERE id=$1", [id]),
      ).rejects.toThrow();
      await expect(db.query("DELETE FROM public.mimo_campanhas_comerciais")).rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 60000);
});
