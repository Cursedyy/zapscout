import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PAPEIS_MIMO, podeAbrirPagina } from "./mimo-acesso";

const empresa = "10000000-0000-4000-8000-000000000001";
const outraEmpresa = "10000000-0000-4000-8000-000000000002";
const conta = (i: number) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
const feedback = (i: number) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;

it("permite acesso à página para todos os cargos MiMo", () => {
  for (const papel of PAPEIS_MIMO) expect(podeAbrirPagina(papel, "/mimo/feedbacks")).toBe(true);
});

it("aplica as permissões do painel no Postgres e protege o status e os autores", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.notificacoes(user_id uuid, tipo text, titulo text, descricao text, link text);
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid STABLE LANGUAGE sql AS
        $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
      CREATE TYPE public.empresa_papel AS ENUM ('administrador','gestor','vendedor','marketing','administrativo');
      CREATE TABLE public.empresas(id uuid PRIMARY KEY, slug text, ativa boolean);
      CREATE TABLE public.empresa_membros(empresa_id uuid, user_id uuid, papel public.empresa_papel, ativo boolean);
      GRANT SELECT ON public.empresas TO authenticated;
      INSERT INTO public.empresas VALUES ('${empresa}','mimo',true), ('${outraEmpresa}','outra',true);
    `);
    const base = readFileSync("drizzle/migrations/0007_mimo_base_acesso.sql", "utf8");
    await db.exec(base.slice(
      base.indexOf("CREATE OR REPLACE FUNCTION public.empresa_papel_de"),
      base.indexOf("-- empresas: membros leem"),
    ));
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-feedbacks.sql", "utf8"));
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-feedback-notificacoes.sql", "utf8"));
    for (const [i, papel] of PAPEIS_MIMO.entries()) {
      await db.query("INSERT INTO auth.users VALUES ($1)", [conta(i)]);
      await db.query("INSERT INTO public.empresa_membros VALUES ($1,$2,$3,true)", [empresa, conta(i), papel]);
    }
    await db.query("INSERT INTO public.empresa_membros VALUES ($1,$2,'administrador',true)", [outraEmpresa, conta(5)]);

    const entrar = (i: number) => db.query("SELECT set_config('app.uid', $1, false)", [conta(i)]);
    const enviar = (i: number, escopo = empresa, titulo = "Melhoria do painel") =>
      db.query(
        "INSERT INTO public.mimo_feedbacks(id,empresa_id,titulo,mensagem) VALUES ($1,$2,$3,'Sugestão') RETURNING criado_por, estado, versao",
        [feedback(i), escopo, titulo],
      );
    const listar = () => db.query("SELECT id FROM public.mimo_feedbacks ORDER BY id");
    const alterar = (versao: number) => db.query(
      "UPDATE public.mimo_feedbacks SET estado='em_analise' WHERE id=$1 AND versao=$2 RETURNING estado,versao,atualizado_por",
      [feedback(0), versao],
    );
    await db.exec("SET ROLE authenticated");
    for (const [i] of PAPEIS_MIMO.entries()) {
      await entrar(i);
      expect((await enviar(i)).rows).toEqual([{ criado_por: conta(i), estado: "recebido", versao: 1 }]);
    }
    for (const [i, papel] of PAPEIS_MIMO.entries()) {
      await entrar(i);
      expect((await listar()).rows).toHaveLength(PAPEIS_MIMO.length);
      if (papel !== "administrador") expect((await alterar(1)).rows).toEqual([]);
    }
    await expect(enviar(1)).rejects.toThrow(/duplicate key/);
    await expect(enviar(6, empresa, "   ")).rejects.toThrow(/check constraint/);
    await expect(db.query("INSERT INTO public.mimo_feedbacks(empresa_id,titulo,mensagem,criado_por) VALUES ($1,'Sugestão','Texto',$2)", [empresa, conta(0)]))
      .rejects.toThrow(/permission denied/);

    await entrar(0);
    expect((await alterar(1)).rows).toEqual([{ estado: "em_analise", versao: 2, atualizado_por: conta(0) }]);
    expect((await alterar(1)).rows).toEqual([]);
    await expect(db.query("UPDATE public.mimo_feedbacks SET titulo='Outro título' WHERE id=$1", [feedback(0)]))
      .rejects.toThrow(/permission denied/);
    await expect(db.query("DELETE FROM public.mimo_feedbacks WHERE id=$1", [feedback(0)]))
      .rejects.toThrow(/permission denied/);

    await entrar(5);
    expect((await listar()).rows).toEqual([]);
    await expect(enviar(6)).rejects.toThrow(/row-level security/);
    await expect(enviar(6, outraEmpresa)).rejects.toThrow(/row-level security/);

    await db.exec("RESET ROLE");
    const avisos = await db.query<{ user_id: string; total: number }>(
      "SELECT user_id, count(*)::integer AS total FROM public.notificacoes WHERE tipo='feedback' AND link='/mimo/feedbacks' GROUP BY user_id ORDER BY user_id",
    );
    expect(avisos.rows).toEqual(PAPEIS_MIMO.flatMap((papel, i) =>
      papel === "administrador" || papel === "gestor" ? [{ user_id: conta(i), total: PAPEIS_MIMO.length - 1 }] : [],
    ));
    await db.query("UPDATE public.empresa_membros SET ativo=false WHERE user_id=$1", [conta(1)]);
    await db.exec("SET ROLE authenticated");
    await entrar(1);
    expect((await listar()).rows).toEqual([]);
    await expect(enviar(6)).rejects.toThrow(/row-level security/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(listar()).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});
