import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("fila: permissões, corte de histórico, dedupe, parada e aceite irreversível", async () => {
  const db = new PGlite();
  const emp = "10000000-0000-4000-8000-000000000001",
    ator = "20000000-0000-4000-8000-000000000001",
    vinculo = "30000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor');
      CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
      CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p))$$;
      INSERT INTO auth.users VALUES('${ator}');INSERT INTO empresas VALUES('${emp}','mimo',true);INSERT INTO empresa_membros VALUES('${emp}','${ator}','administrador',true);
      CREATE TABLE mimo_leads(id uuid PRIMARY KEY,empresa_id uuid,telefone_normalizado text);
      CREATE TABLE mimo_whatsapp_vinculos(id uuid PRIMARY KEY,empresa_id uuid,ativo boolean,confirmado_por uuid);
      CREATE TABLE mimo_whatsapp_eventos(id uuid PRIMARY KEY,empresa_id uuid,lead_id uuid,direcao text,texto text);
      CREATE FUNCTION mimo_normalizar_telefone(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT CASE WHEN regexp_replace(v,'[^0-9]','','g') ~ '^[1-9][0-9]{9,14}$' THEN regexp_replace(v,'[^0-9]','','g') END$$;
      CREATE FUNCTION teste_agora() RETURNS timestamptz LANGUAGE sql AS $$SELECT '2026-11-06T23:00:00Z'::timestamptz$$;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-carrinhos.sql", "utf8"));
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-carrinhos-oauth.sql", "utf8"));
    const sql = (
      readFileSync("docs/migracoes-preparadas/mimo-recuperacao-whatsapp.sql", "utf8") +
      readFileSync("docs/migracoes-preparadas/mimo-recuperacao-24h.sql", "utf8")
    ).replaceAll("clock_timestamp()", "public.teste_agora()");
    await expect(
      db.exec(
        `DO $recuperacao_test$ BEGIN ${sql} RAISE EXCEPTION 'rollback_sintetico'; END $recuperacao_test$;`,
      ),
    ).rejects.toThrow("rollback_sintetico");
    expect(
      (await db.query("select to_regclass('public.mimo_recuperacao_fila') as tabela")).rows,
    ).toEqual([{ tabela: null }]);
    await db.exec(`DO $recuperacao_test$ BEGIN ${sql} END $recuperacao_test$;`);
    await db.exec(`INSERT INTO mimo_nuvem_lojas(empresa_id,loja_id,sincronizado_por) VALUES('${emp}','123','${ator}');
      INSERT INTO mimo_whatsapp_vinculos VALUES('${vinculo}','${emp}',true,'${ator}');
      INSERT INTO mimo_recuperacao_config(empresa_id,loja_id,vinculo_id,ativo,inicio_em,ator_id) VALUES('${emp}','123','${vinculo}',true,'2026-11-06T09:00:00Z','${ator}');
      INSERT INTO mimo_nuvem_carrinhos VALUES('${emp}','123','42',repeat('a',64),'Sintético','','5511999999999',12345,'BRL','https://loja.example.invalid/checkout/sintetico','[]','2026-11-06T10:00:00Z','2026-11-06T10:00:00Z'),
      ('${emp}','123','43',repeat('b',64),'Histórico','','5511888888888',12345,'BRL','https://loja.example.invalid/checkout/historico','[]','2026-11-05T10:00:00Z','2026-11-05T10:00:00Z');`);
    expect(
      (
        await db.query(
          "select has_table_privilege('authenticated','mimo_recuperacao_fila','INSERT') as permitido",
        )
      ).rows,
    ).toEqual([{ permitido: false }]);
    await db.exec("SET ROLE authenticated");
    await expect(db.query("select * from mimo_recuperacao_reservar($1)", [emp])).rejects.toThrow();
    await db.exec("RESET ROLE;SET ROLE service_role");
    const reservar = () =>
      db.query<{ id: string; reserva: string }>("select * from mimo_recuperacao_reservar($1)", [
        emp,
      ]);
    const primeira = (await reservar()).rows[0];
    expect(primeira).toBeDefined();
    expect((await reservar()).rows).toHaveLength(0);
    expect((await db.query("select checkout_id from mimo_recuperacao_fila")).rows).toEqual([
      { checkout_id: "42" },
    ]);
    await db.exec(
      `RESET ROLE;INSERT INTO mimo_leads VALUES('${ator}','${emp}','5511999999999');INSERT INTO mimo_whatsapp_eventos VALUES('${vinculo}','${emp}','${ator}','recebida','Não quero mais receber mensagens');SET ROLE service_role;`,
    );
    expect((await db.query("select estado from mimo_recuperacao_fila")).rows).toEqual([
      { estado: "bloqueada" },
    ]);
    expect(
      (
        await db.query("select mimo_recuperacao_autorizar($1,$2) as aceita", [
          primeira.id,
          primeira.reserva,
        ])
      ).rows,
    ).toEqual([{ aceita: false }]);
    await db.exec(
      `RESET ROLE;DELETE FROM mimo_recuperacao_supressoes;UPDATE mimo_recuperacao_fila SET estado='pendente';SET ROLE service_role;`,
    );
    const segunda = (await reservar()).rows[0];
    expect(
      (
        await db.query("select mimo_recuperacao_autorizar($1,$2) as aceita", [
          segunda.id,
          segunda.reserva,
        ])
      ).rows,
    ).toEqual([{ aceita: true }]);
    await db.query("select mimo_recuperacao_concluir($1,$2,'enviada','sintetico',null)", [
      segunda.id,
      segunda.reserva,
    ]);
    expect((await reservar()).rows).toHaveLength(0);
    await expect(
      db.query("select mimo_recuperacao_concluir($1,$2,'incerta',null,null)", [
        segunda.id,
        segunda.reserva,
      ]),
    ).rejects.toThrow();
    expect((await db.query("select estado from mimo_recuperacao_fila")).rows).toEqual([
      { estado: "enviada" },
    ]);
    await db.exec(
      `RESET ROLE;INSERT INTO mimo_nuvem_pedidos(empresa_id,loja_id,pedido_id,token_hash,numero,status,pagamento,total,moeda,origem_updated_at,origem_created_at) VALUES('${emp}','123','99',repeat('a',64),'100','open','paid',12345,'BRL','2026-11-06T23:10:00Z','2026-11-06T23:05:00Z');SET ROLE service_role;`,
    );
    const metricas = () =>
      db.query<{ dados: { enviadas: number; compras: number; valorCentavos: string } }>(
        "select mimo_recuperacao_indicadores($1,$2) as dados",
        [emp, ator],
      );
    expect((await metricas()).rows[0].dados).toMatchObject({
      enviadas: 1,
      compras: 1,
      valorCentavos: "12345",
    });
    await db.exec(
      "RESET ROLE;UPDATE mimo_nuvem_pedidos SET pagamento='refunded';SET ROLE service_role;",
    );
    expect((await metricas()).rows[0].dados).toMatchObject({
      enviadas: 1,
      compras: 0,
      valorCentavos: "0",
    });
  } finally {
    await db.close();
  }
});
