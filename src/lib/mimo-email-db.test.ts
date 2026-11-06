import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("e-mail: RLS, teste obrigatório, corte, dedupe, descadastro e autorização final", async () => {
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
    for (const arquivo of ["mimo-carrinhos", "mimo-carrinhos-oauth", "mimo-recuperacao-whatsapp"])
      await db.exec(readFileSync(`docs/migracoes-preparadas/${arquivo}.sql`, "utf8"));
    const sql = readFileSync("docs/migracoes-preparadas/mimo-recuperacao-email.sql", "utf8")
      .replaceAll("clock_timestamp()", "public.teste_agora()")
      .replaceAll("now()", "public.teste_agora()");
    await expect(
      db.exec(
        `DO $rollback_email$ BEGIN ${sql} RAISE EXCEPTION 'rollback_email';END $rollback_email$;`,
      ),
    ).rejects.toThrow("rollback_email");
    expect((await db.query("select to_regclass('public.mimo_email_fila') as t")).rows).toEqual([
      { t: null },
    ]);
    await db.exec(sql);
    await db.exec(`INSERT INTO mimo_nuvem_lojas(empresa_id,loja_id,sincronizado_por) VALUES('${emp}','123','${ator}');
   INSERT INTO mimo_whatsapp_vinculos VALUES('${vinculo}','${emp}',true,'${ator}');
   INSERT INTO mimo_nuvem_carrinhos VALUES('${emp}','123','42',repeat('a',64),'Sintético','cliente@example.invalid','5511999999999',12345,'BRL','https://loja.example.invalid/checkout/sintetico','[]','2026-11-06T10:00:00Z','2026-11-06T10:00:00Z'),
   ('${emp}','123','43',repeat('b',64),'Histórico','historico@example.invalid','5511888888888',12345,'BRL','https://loja.example.invalid/checkout/historico','[]','2026-11-05T10:00:00Z','2026-11-05T10:00:00Z');
   INSERT INTO mimo_email_credenciais(empresa_id,remetente,assunto_google,refresh_cifrado,atualizado_por) VALUES('${emp}','remetente@example.invalid','sub-sintetico','v1:'||repeat('a',24)||':'||repeat('b',64),'${ator}');
   INSERT INTO mimo_email_config(empresa_id,loja_id,ator_id,inicio_em) VALUES('${emp}','123','${ator}','2026-11-06T09:00:00Z');`);
    const versao = (await db.query<{ versao: string }>("SELECT versao FROM mimo_email_credenciais"))
      .rows[0].versao;
    expect(
      (
        await db.query(
          "select has_table_privilege('authenticated','mimo_email_credenciais','SELECT') as ok",
        )
      ).rows,
    ).toEqual([{ ok: false }]);
    await db.exec("SET ROLE authenticated");
    await expect(
      db.query("select mimo_email_credencial_ler($1,$2)", [emp, ator]),
    ).rejects.toThrow();
    await expect(
      db.query("select mimo_email_reservar($1,'123',$2,'43')", [emp, ator]),
    ).rejects.toThrow();
    await db.exec("RESET ROLE;SET ROLE service_role");
    const reservar = async (checkout: string | null = null) =>
      (
        await db.query<{ d: { id: string; reserva: string; email: string } | null }>(
          "select mimo_email_reservar($1,'123',$2,$3) as d",
          [emp, ator, checkout],
        )
      ).rows[0].d;
    const autorizar = async (f: { id: string; reserva: string }) =>
      (
        await db.query<{ ok: boolean }>("select mimo_email_autorizar($1,$2,$3) as ok", [
          f.id,
          f.reserva,
          versao,
        ])
      ).rows[0].ok;
    expect(await reservar("43")).toBeNull();
    await expect(db.query("select mimo_email_configurar($1,$2,true)", [emp, ator])).rejects.toThrow(
      "teste interno",
    );
    const teste = "40000000-0000-4000-8000-000000000001";
    const reservarTeste = () =>
      db.query<{ ok: boolean }>(
        "select mimo_email_teste_reservar($1,$2,$3,'equipe@example.invalid',$4) as ok",
        [emp, ator, teste, versao],
      );
    expect((await reservarTeste()).rows[0].ok).toBe(true);
    expect((await reservarTeste()).rows[0].ok).toBe(false);
    await db.query("select mimo_email_teste_concluir($1,$2,$3,'teste-sintetico')", [
      emp,
      ator,
      teste,
    ]);
    expect(await reservar()).toBeNull(); // automático segue pausado depois do teste
    const historico = (await reservar("43"))!;
    expect(historico.email).toBe("historico@example.invalid");
    expect(await reservar("43")).toBeNull();
    expect(await autorizar(historico)).toBe(true);
    await db.query("select mimo_email_concluir($1,$2,'enviada','gmail-sintetico',null)", [
      historico.id,
      historico.reserva,
    ]);
    expect(await reservar("43")).toBeNull();
    await expect(
      db.query("select mimo_email_concluir($1,$2,'incerta',null,null)", [
        historico.id,
        historico.reserva,
      ]),
    ).rejects.toThrow();
    await db.query("select mimo_email_configurar($1,$2,true)", [emp, ator]);
    const novo = (await reservar())!;
    expect(novo.email).toBe("cliente@example.invalid");
    // Compra registrada após a reserva impede autorizar.
    await db.exec(
      `RESET ROLE;INSERT INTO mimo_nuvem_pedidos(empresa_id,loja_id,pedido_id,token_hash,numero,status,pagamento,total,moeda,origem_updated_at) VALUES('${emp}','123','100',repeat('a',64),'101','open','pending',12345,'BRL','2026-11-06T23:00:00Z');SET ROLE service_role;`,
    );
    expect(await autorizar(novo)).toBe(false);
    // Descadastro protege o e-mail também para carrinhos futuros da mesma empresa.
    await db.query("select mimo_email_descadastrar($1)", [historico.id]);
    await db.exec(
      `RESET ROLE;INSERT INTO mimo_nuvem_carrinhos SELECT empresa_id,loja_id,'44',repeat('c',64),nome,email,telefone,total,moeda,url,itens,origem_created_at,origem_updated_at FROM mimo_nuvem_carrinhos WHERE checkout_id='43';SET ROLE service_role;`,
    );
    expect(await reservar("44")).toBeNull();
    const diag = (
      await db.query<{ d: { id: string; motivo: string; podeEnviar: boolean }[] }>(
        "select mimo_email_diagnostico($1,$2,ARRAY['44']) as d",
        [emp, ator],
      )
    ).rows[0].d;
    expect(diag).toMatchObject([{ id: "44", podeEnviar: false }]);
    // O histórico de WhatsApp não recebe os envios nem os testes de Gmail.
    await db.exec("RESET ROLE");
    expect((await db.query("select count(*)::int as n from mimo_recuperacao_fila")).rows).toEqual([
      { n: 0 },
    ]);
    await db.exec("SET ROLE service_role");
    const hash = "d".repeat(64),
      cipher = "v1:" + "a".repeat(24) + ":" + "b".repeat(64);
    await db.query("select mimo_email_oauth_iniciar($1,$2,$3,$4)", [emp, ator, hash, cipher]);
    await db.query("select mimo_email_oauth_consumir($1)", [hash]);
    await db.query("select mimo_email_oauth_falhar($1,$2,$3)", [hash, emp, ator]);
    await expect(
      db.query(
        "select mimo_email_oauth_salvar($1,$2,'123',$3,'remetente@example.invalid','sub-novo',$4)",
        [hash, emp, ator, cipher],
      ),
    ).rejects.toThrow("Autorização inválida");
    await expect(db.query("select mimo_email_oauth_consumir($1)", [hash])).rejects.toThrow();
    const hash2 = "e".repeat(64);
    await db.query("select mimo_email_oauth_iniciar($1,$2,$3,$4)", [emp, ator, hash2, cipher]);
    await db.query("select mimo_email_oauth_consumir($1)", [hash2]);
    await expect(
      db.query("select mimo_email_oauth_iniciar($1,$2,$3,$4)", [emp, ator, "f".repeat(64), cipher]),
    ).rejects.toThrow("processamento");
    // Falha antiga não finaliza a nova autorização consumida.
    await db.query("select mimo_email_oauth_falhar($1,$2,$3)", [hash, emp, ator]);
    await db.exec("RESET ROLE;UPDATE empresa_membros SET ativo=false;SET ROLE service_role");
    await expect(
      db.query(
        "select mimo_email_oauth_salvar($1,$2,'123',$3,'remetente@example.invalid','sub-novo',$4)",
        [hash2, emp, ator, cipher],
      ),
    ).rejects.toThrow("Acesso negado");
    await db.exec("RESET ROLE;UPDATE empresa_membros SET ativo=true;SET ROLE service_role");
    await db.query(
      "select mimo_email_oauth_salvar($1,$2,'123',$3,'remetente@example.invalid','sub-novo',$4)",
      [hash2, emp, ator, cipher],
    );
    expect(
      (
        await db.query<{ d: { ativo: boolean; pilotoOk: boolean } }>(
          "select mimo_email_painel($1,$2) as d",
          [emp, ator],
        )
      ).rows[0].d,
    ).toMatchObject({ ativo: false, pilotoOk: false });
  } finally {
    await db.close();
  }
});
