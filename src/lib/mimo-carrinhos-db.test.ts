import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("carrinhos: RLS, RPC restrita, idempotência, estados fora de ordem e rollback", async () => {
  const db = new PGlite();
  const emp = "10000000-0000-4000-8000-000000000001",
    other = "10000000-0000-4000-8000-000000000002";
  const users = Array.from({ length: 6 }, (_, i) => `20000000-0000-4000-8000-00000000000${i + 1}`);
  const cart = {
    checkout_id: "42",
    token_hash: "a".repeat(64),
    nome: "Sintético",
    email: "teste@example.invalid",
    telefone: "",
    total: 12345,
    moeda: "BRL",
    url: null,
    itens: [],
    origem_created_at: "2026-11-01T12:00:00Z",
    origem_updated_at: "2026-11-02T12:00:00Z",
  };
  const order = {
    pedido_id: "42",
    token_hash: cart.token_hash,
    numero: "100",
    status: "open",
    pagamento: "paid",
    total: 12345,
    moeda: "BRL",
    origem_updated_at: "2026-11-03T12:00:00Z",
  };
  const user = (i: number) =>
    db.exec(`RESET ROLE; SET request.jwt.claim.sub='${users[i]}';SET ROLE authenticated;`);
  const sync = (
    c: unknown[] = [cart],
    p: unknown[] = [order],
    actor = users[0],
    e = emp,
    loja = "123",
  ) =>
    db.query("select mimo_nuvem_sincronizar($1,$2,$3,$4,$5)", [
      e,
      loja,
      actor,
      JSON.stringify(c),
      JSON.stringify(p),
    ]);
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$;
  GRANT USAGE ON SCHEMA auth,public TO authenticated,service_role;
  CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
  CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
  CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p))$$;
  GRANT SELECT ON empresas TO authenticated;
  INSERT INTO empresas VALUES('${emp}','mimo',true),('${other}','outra',true);
  INSERT INTO auth.users VALUES ${users.map((id) => `('${id}')`).join(",")};
  INSERT INTO empresa_membros VALUES ${users
    .slice(0, 5)
    .map(
      (id, i) =>
        `('${emp}','${id}','${["administrador", "gestor", "vendedor", "marketing", "administrativo"][i]}',true)`,
    )
    .join(",")},('${other}','${users[5]}','administrador',true);`);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-carrinhos.sql", "utf8"));
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-carrinhos-oauth.sql", "utf8"));
    await db.exec(
      readFileSync("docs/migracoes-preparadas/mimo-nuvem-oauth-liberar-falha.sql", "utf8").replace(
        /^\uFEFF/,
        "",
      ),
    );
    await db.exec("SET ROLE service_role");
    // Compra pode ser recebida antes do carrinho; a associação fica disponível depois.
    await sync([], [order]);
    await sync([cart], []);
    await sync();
    await user(0);
    expect((await db.query("select * from mimo_nuvem_carrinhos")).rows).toHaveLength(1);
    expect((await db.query("select * from mimo_nuvem_pedidos")).rows).toHaveLength(1);
    await expect(sync()).rejects.toThrow();
    await expect(db.exec("update mimo_nuvem_carrinhos set total=1")).rejects.toThrow();
    await user(1);
    expect((await db.query("select * from mimo_nuvem_carrinhos")).rows).toHaveLength(1);
    for (const i of [2, 3, 4, 5]) {
      await user(i);
      expect((await db.query("select * from mimo_nuvem_carrinhos")).rows).toHaveLength(0);
    }
    await db.exec("RESET ROLE;SET ROLE service_role");
    await sync(
      [{ ...cart, total: 1, origem_updated_at: "2026-11-01T12:00:00Z" }],
      [{ ...order, pagamento: "pending", origem_updated_at: "2026-11-02T12:00:00Z" }],
    );
    await user(0);
    expect(
      (await db.query<{ total: number }>("select total from mimo_nuvem_carrinhos")).rows[0].total,
    ).toBe(12345);
    expect(
      (await db.query<{ pagamento: string }>("select pagamento from mimo_nuvem_pedidos")).rows[0]
        .pagamento,
    ).toBe("paid");
    await db.exec("RESET ROLE;SET ROLE service_role");
    await expect(sync([], [], users[2])).rejects.toThrow("Acesso negado");
    await expect(sync([], [], users[5], other)).rejects.toThrow("Acesso negado");
    await expect(sync([], [], users[0], emp, "456")).rejects.toThrow("Vínculo");
    await expect(
      sync(
        [{ ...cart, checkout_id: "43", token_hash: "b".repeat(64) }],
        [{ ...order, total: -1, origem_updated_at: "2026-11-04T12:00:00Z" }],
      ),
    ).rejects.toThrow();
    await user(0);
    expect((await db.query("select * from mimo_nuvem_carrinhos")).rows).toHaveLength(1);
    // OAuth: estado de uso único, cifra inacessível ao navegador e vínculo invariável.
    const hash = "c".repeat(64),
      cipher = "v1:" + "a".repeat(24) + ":" + "b".repeat(64);
    await db.exec("RESET ROLE;SET ROLE service_role");
    await db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [emp, users[0], hash]);
    await expect(
      db.query("select mimo_nuvem_oauth_salvar($1,$2,'123',$3,$4)", [hash, emp, users[0], cipher]),
    ).rejects.toThrow("Autorização inválida");
    expect(
      (await db.query("select * from mimo_nuvem_oauth_consumir($1)", [hash])).rows,
    ).toHaveLength(1);
    await expect(db.query("select * from mimo_nuvem_oauth_consumir($1)", [hash])).rejects.toThrow(
      "usada",
    );
    await db.query("select mimo_nuvem_oauth_salvar($1,$2,'123',$3,$4)", [
      hash,
      emp,
      users[0],
      cipher,
    ]);
    await expect(
      db.query("select mimo_nuvem_oauth_salvar($1,$2,'123',$3,$4)", [hash, emp, users[0], cipher]),
    ).rejects.toThrow("Autorização inválida");
    expect(
      (
        await db.query<{ token: string }>("select mimo_nuvem_oauth_ler($1,'123',$2) token", [
          emp,
          users[1],
        ])
      ).rows[0].token,
    ).toBe(cipher);
    await expect(
      db.query("select mimo_nuvem_oauth_ler($1,'123',$2)", [emp, users[2]]),
    ).rejects.toThrow("Acesso negado");
    await user(0);
    await expect(db.query("select * from mimo_nuvem_credenciais")).rejects.toThrow();
    await expect(db.query("select * from mimo_nuvem_oauth_estados")).rejects.toThrow();
    await expect(
      db.query("select mimo_nuvem_oauth_ler($1,'123',$2)", [emp, users[0]]),
    ).rejects.toThrow();
    await db.exec("RESET ROLE;SET ROLE service_role");
    // Falha confirmada libera nova autorização sem permitir reuso ou save tardio.
    const falhou = "e".repeat(64),
      nova = "f".repeat(64);
    const falhar = (h: string, ator = users[1], loja = "123") =>
      db.query("select mimo_nuvem_oauth_falhar($1,$2,$3,$4)", [h, emp, loja, ator]);
    await db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [emp, users[1], falhou]);
    await falhar(falhou); // estado ainda não consumido não é cancelado
    await db.query("select * from mimo_nuvem_oauth_consumir($1)", [falhou]);
    await expect(
      db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [emp, users[1], nova]),
    ).rejects.toThrow("ainda está sendo processada");
    await falhar(falhou, users[0]); // outro ator não libera a tentativa
    await falhar(falhou, users[1], "999"); // outra loja também não
    await expect(
      db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [emp, users[1], nova]),
    ).rejects.toThrow("ainda está sendo processada");
    await falhar(falhou);
    await falhar(falhou); // finalização de falha idempotente
    await expect(db.query("select * from mimo_nuvem_oauth_consumir($1)", [falhou])).rejects.toThrow(
      "usada",
    );
    await expect(
      db.query("select mimo_nuvem_oauth_salvar($1,$2,'123',$3,$4)", [
        falhou,
        emp,
        users[1],
        cipher,
      ]),
    ).rejects.toThrow("Autorização inválida");
    await db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [emp, users[1], nova]);
    await db.query("select * from mimo_nuvem_oauth_consumir($1)", [nova]);
    await falhar(falhou); // callback antigo não libera a nova tentativa
    await expect(
      db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [emp, users[1], "1".repeat(64)]),
    ).rejects.toThrow("ainda está sendo processada");
    await db.query("select mimo_nuvem_oauth_salvar($1,$2,'123',$3,$4)", [
      nova,
      emp,
      users[1],
      cipher,
    ]);
    await falhar(nova); // sucesso não é invalidado por liberação tardia
    expect(
      (
        await db.query<{ token: string }>("select mimo_nuvem_oauth_ler($1,'123',$2) token", [
          emp,
          users[1],
        ])
      ).rows[0].token,
    ).toBe(cipher);
    await user(0);
    await expect(falhar(nova, users[0])).rejects.toThrow();
    await db.exec("RESET ROLE;SET ROLE anon");
    await expect(falhar(nova, users[0])).rejects.toThrow();
    await db.exec("RESET ROLE;SET ROLE service_role");
    await db.query("select mimo_nuvem_oauth_iniciar($1,'123',$2,$3)", [
      emp,
      users[0],
      "d".repeat(64),
    ]);
    await db.exec(
      "RESET ROLE;UPDATE mimo_nuvem_oauth_estados SET expira_em=now()-interval '1 minute' WHERE hash=repeat('d',64);SET ROLE service_role",
    );
    await expect(
      db.query("select * from mimo_nuvem_oauth_consumir($1)", ["d".repeat(64)]),
    ).rejects.toThrow("expirada");
    await db.exec(
      `RESET ROLE;UPDATE empresa_membros SET ativo=false WHERE user_id='${users[0]}';SET ROLE service_role;`,
    );
    await expect(sync()).rejects.toThrow("Acesso negado");
  } finally {
    await db.close();
  }
}, 60000);
