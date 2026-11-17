import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("lookup limita empresa e retorna somente o vínculo; clientes não podem executá-lo", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE empresas(id uuid,slug text,ativa boolean);
      CREATE TABLE mimo_agente_config(empresa_id uuid,vinculo_id uuid);
      INSERT INTO empresas VALUES ('00000000-0000-4000-8000-000000000001','mimo',true),('00000000-0000-4000-8000-000000000002','outro',true);
      INSERT INTO mimo_agente_config VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');`);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-recuperacao-remetente.sql", "utf8"));
    await db.exec("SET ROLE service_role");
    expect(
      (
        await db.query(
          "select mimo_recuperacao_vinculo_ia('00000000-0000-4000-8000-000000000001') id",
        )
      ).rows,
    ).toEqual([{ id: "00000000-0000-4000-8000-000000000003" }]);
    expect(
      (
        await db.query(
          "select mimo_recuperacao_vinculo_ia('00000000-0000-4000-8000-000000000002') id",
        )
      ).rows,
    ).toEqual([{ id: null }]);
    await expect(db.query("select * from mimo_agente_config")).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(
      db.query("select mimo_recuperacao_vinculo_ia('00000000-0000-4000-8000-000000000001')"),
    ).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    await expect(
      db.query("select mimo_recuperacao_vinculo_ia('00000000-0000-4000-8000-000000000001')"),
    ).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
});
