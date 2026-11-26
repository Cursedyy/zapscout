import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("reserva um único envio por pedido e permite somente a confirmação da mesma operação", async () => {
  const db = new PGlite();
  const empresa = "10000000-0000-4000-8000-000000000001";
  const ator = "20000000-0000-4000-8000-000000000001";
  const venda = "30000000-0000-4000-8000-000000000001";
  const app = "a".repeat(64);
  const hash = "b".repeat(64);
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.empresas(id uuid PRIMARY KEY);
      CREATE TABLE public.mimo_tira_pedidos (
        id uuid PRIMARY KEY, empresa_id uuid, lead_id uuid, versao integer, status text, documento jsonb, pix jsonb
      );
      CREATE FUNCTION public.mimo_tira_ator(uuid,uuid,uuid,boolean) RETURNS text LANGUAGE sql AS
        $$ SELECT CASE WHEN $2 = '${ator}' THEN 'administrativo' ELSE 'vendedor' END $$;
      CREATE FUNCTION public.mimo_tira_status(uuid,uuid,uuid,integer,text,text,text) RETURNS public.mimo_tira_pedidos LANGUAGE sql AS
        $$ UPDATE public.mimo_tira_pedidos SET status=$5, versao=versao+1
          WHERE id=$3 AND versao=$4 RETURNING * $$;
      INSERT INTO auth.users VALUES ('${ator}');
      INSERT INTO public.empresas VALUES ('${empresa}');
      INSERT INTO public.mimo_tira_pedidos VALUES
        ('${venda}','${empresa}',NULL,7,'confirmado','{"pagamento":{"forma":"pix"}}',NULL);
    `);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-omie-envio-pedido.sql", "utf8"));
    await db.exec(
      readFileSync("docs/migracoes-preparadas/mimo-omie-faturamento-producao.sql", "utf8"),
    );
    const registrar = (versao = 7, hashPedido = hash, atorId = ator, codigo?: number) =>
      db.query("SELECT public.mimo_omie_registrar_envio($1,$2,$3,$4,$5,$6,$7,$8,$9) AS envio", [
        empresa,
        atorId,
        venda,
        versao,
        app,
        hashPedido,
        codigo ?? null,
        codigo === undefined ? null : "001002",
        codigo === undefined ? null : hash,
      ]);
    await db.exec("SET ROLE authenticated");
    await expect(registrar()).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE; SET ROLE service_role");
    await expect(registrar(7, hash, venda)).rejects.toThrow(/acesso negado/);
    await expect(registrar()).rejects.toThrow(/indisponivel/);
    await db.exec("RESET ROLE");
    await db.query("UPDATE public.mimo_tira_pedidos SET pix='{}' WHERE id=$1", [venda]);
    await db.exec("SET ROLE service_role");
    await expect(registrar(6)).rejects.toThrow(/indisponivel/);
    expect((await registrar()).rows).toEqual([
      { envio: { reservado: true, codigo: null, numero: null } },
    ]);
    expect((await registrar()).rows).toEqual([
      { envio: { reservado: false, codigo: null, numero: null } },
    ]);
    await expect(registrar(7, app)).rejects.toThrow(/envio anterior/);
    expect((await registrar(7, hash, ator, 99)).rows).toEqual([
      { envio: { reservado: false, codigo: 99, numero: "001002" } },
    ]);
    await expect(registrar(7, hash, ator, 101)).rejects.toThrow(/divergente/);
    expect((await registrar()).rows).toEqual([
      { envio: { reservado: false, codigo: 99, numero: "001002" } },
    ]);
    const fiscal = (acao: string, assinatura = hash, chave?: string) =>
      db.query<{ operacao: Record<string, unknown> }>(
        "SELECT public.mimo_omie_operar_nfe($1,$2,$3,7,$4,$5,$6,$7,$8,$9) AS operacao",
        [
          empresa,
          ator,
          venda,
          app,
          acao,
          assinatura,
          chave ?? null,
          chave ? "42" : null,
          chave ? "2026-11-26" : null,
        ],
      );
    await expect(fiscal("reservar", app)).rejects.toThrow(/divergente/);
    expect((await fiscal("reservar")).rows[0].operacao).toMatchObject({
      reservada: true,
      pendente: true,
    });
    expect((await fiscal("reservar")).rows[0].operacao).toMatchObject({
      reservada: false,
      pendente: true,
    });
    await db.exec("RESET ROLE");
    await expect(
      db.query("UPDATE public.mimo_tira_pedidos SET status='cancelado' WHERE id=$1", [venda]),
    ).rejects.toThrow(/aguarda conciliacao/);
    await db.exec("SET ROLE service_role");
    await expect(fiscal("confirmar")).rejects.toThrow(/Identidade da NF-e/);
    const chave = "1".repeat(44);
    expect((await fiscal("confirmar", hash, chave)).rows[0].operacao).toMatchObject({
      nfe: "42",
      pendente: false,
    });
    expect((await fiscal("confirmar", hash, chave)).rows[0].operacao).toMatchObject({ nfe: "42" });
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT status,versao FROM public.mimo_tira_pedidos")).rows).toEqual([
      { status: "faturado", versao: 8 },
    ]);
  } finally {
    await db.close();
  }
});
