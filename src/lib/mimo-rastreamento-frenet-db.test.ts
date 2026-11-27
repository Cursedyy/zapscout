import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("restringe os vínculos por pedido, empresa e papel no PostgreSQL", async () => {
  const db = new PGlite();
  const empresa = "10000000-0000-4000-8000-000000000001";
  const outraEmpresa = "10000000-0000-4000-8000-000000000002";
  const pedido = "20000000-0000-4000-8000-000000000001";
  const admin = "30000000-0000-4000-8000-000000000001";
  const vendedor = "30000000-0000-4000-8000-000000000002";
  const marketing = "30000000-0000-4000-8000-000000000003";
  const colega = "30000000-0000-4000-8000-000000000004";
  const hoje = "40000000-0000-4000-8000-000000000001";
  const rpc = (
    ator: string,
    codigo: string,
    servico: string,
    anterior: string | null = null,
    servicoAnterior: string | null = null,
  ) =>
    db.query("SELECT public.mimo_frenet_vincular_remessa($1,$2,$3,$4,$5,$6,$7)", [
      empresa,
      ator,
      pedido,
      codigo,
      servico,
      anterior,
      servicoAnterior,
    ]);
  const assumir = (papel: "authenticated" | "service_role", pessoa: string) =>
    db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${pessoa}'; SET ROLE ${papel};`);
  const ler = () =>
    db.query("SELECT codigo, servico FROM public.mimo_frenet_remessas ORDER BY codigo");

  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TYPE public.empresa_papel AS ENUM ('administrador','gestor','administrativo','vendedor','marketing');
      CREATE TABLE public.empresas (id uuid PRIMARY KEY, slug text, ativa boolean);
      CREATE TABLE public.empresa_membros (id uuid DEFAULT gen_random_uuid(), empresa_id uuid, user_id uuid, papel public.empresa_papel, ativo boolean);
      CREATE TABLE public.mimo_leads (id uuid, empresa_id uuid, responsavel_id uuid);
      CREATE TABLE public.mimo_tira_pedidos (
        id uuid PRIMARY KEY, empresa_id uuid, lead_id uuid, status text, UNIQUE (empresa_id,id)
      );
      CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT EXISTS (SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p))
      $$;
      CREATE VIEW public.mimo_tira_pedidos_seguros AS
        SELECT p.id, p.empresa_id, p.status
        FROM public.mimo_tira_pedidos p JOIN public.empresa_membros m ON m.empresa_id=p.empresa_id
        JOIN public.mimo_leads l ON l.id=p.lead_id
        WHERE m.ativo AND m.user_id=auth.uid() AND (m.papel <> 'vendedor' OR l.responsavel_id=m.user_id);
      GRANT SELECT ON public.mimo_tira_pedidos_seguros TO authenticated;
      GRANT SELECT, UPDATE ON public.mimo_tira_pedidos TO service_role;
      INSERT INTO public.empresas VALUES ('${empresa}','mimo',true), ('${outraEmpresa}','outra',true);
      INSERT INTO public.empresa_membros (empresa_id,user_id,papel,ativo) VALUES
        ('${empresa}','${admin}','administrador',true), ('${empresa}','${vendedor}','vendedor',true),
        ('${empresa}','${marketing}','marketing',true), ('${outraEmpresa}','${colega}','administrador',true);
      INSERT INTO public.mimo_leads VALUES ('${hoje}','${empresa}','${vendedor}');
      INSERT INTO public.mimo_tira_pedidos VALUES ('${pedido}','${empresa}','${hoje}','enviado');
    `);
    const tira = readFileSync("drizzle/migrations/0014_mimo_tira_pedido.sql", "utf8");
    const actor = tira.match(
      /CREATE FUNCTION public\.mimo_tira_ator\([\s\S]*?GRANT EXECUTE ON FUNCTION public\.mimo_tira_ator[^;]*;/,
    )?.[0];
    expect(actor).toBeDefined();
    await db.exec(actor!);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-frenet-rastreamento.sql", "utf8"));

    await assumir("service_role", admin);
    await expect(rpc(vendedor, "AB123BR", "04669")).rejects.toMatchObject({ code: "42501" });
    await rpc(admin, "AB123BR", "04669");
    await rpc(admin, "AB123BR", "04669");
    await rpc(admin, "CD456BR", "04669");
    await rpc(admin, "AB123BR", "04668", "AB123BR", "04669");
    await expect(rpc(admin, "AB123BR", "04667", "AB123BR", "04669")).rejects.toMatchObject({
      code: "40001",
    });

    await assumir("authenticated", vendedor);
    expect((await ler()).rows).toEqual([
      { codigo: "AB123BR", servico: "04668" },
      { codigo: "CD456BR", servico: "04669" },
    ]);
    await expect(rpc(admin, "AB456BR", "04669")).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.exec("UPDATE public.mimo_frenet_remessas SET servico='OPA'"),
    ).rejects.toMatchObject({ code: "42501" });
    await assumir("authenticated", marketing);
    expect((await ler()).rows).toEqual([]);
    await assumir("authenticated", colega);
    expect((await ler()).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 20_000);
