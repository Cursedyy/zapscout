import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
const setup = readFileSync("docs/migracoes-preparadas/mimo-agente-agendamento.sql", "utf8").replace(
  /^\uFEFF/,
  "",
);
const source =
  "SELECT net.http_post('https://example.invalid/api/public/hooks/process-mimo-recuperacao','{\"x-cron-secret\":\"synthetic-only\"}'::jsonb)";
async function database() {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA cron;
    CREATE TABLE cron.job(jobid bigserial,jobname text UNIQUE,schedule text,command text,active boolean DEFAULT true);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$DECLARE n bigint;BEGIN INSERT INTO cron.job(jobname,schedule,command)VALUES($1,$2,$3)RETURNING jobid INTO n;RETURN n;END$$;
    CREATE FUNCTION cron.alter_job(job_id bigint,active boolean) RETURNS void LANGUAGE sql AS $$UPDATE cron.job SET active=$2 WHERE jobid=$1$$;
    CREATE TABLE mimo_agente_config(empresa_id int,modo text);
    CREATE TABLE mimo_agente_fila(empresa_id int,estado text,reservada_em timestamptz,solicitado_por uuid,executar_em timestamptz);
    CREATE SCHEMA net;CREATE TABLE test_http_calls(n int);
    CREATE FUNCTION net.http_post(url text,headers jsonb) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN INSERT INTO test_http_calls VALUES(1);RETURN 1;END$$;`);
  await db.query("INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3)", [
    "mimo-recuperacao-whatsapp",
    "*/5 * * * *",
    source,
  ]);
  return db;
}
const job = async (db: PGlite) =>
  (
    await db.query<{ command: string; active: boolean; schedule: string }>(
      "SELECT command,active,schedule FROM cron.job WHERE jobname='mimo-agente-whatsapp'",
    )
  ).rows[0];
const calls = async (db: PGlite) =>
  (await db.query<{ n: number }>("SELECT count(*)::int n FROM test_http_calls")).rows[0].n;
it("agendador é instalado inativo, preserva transporte e permite repetição sem mudar o estado", async () => {
  const db = await database();
  try {
    await db.exec(setup);
    await db.exec(setup);
    let j = await job(db);
    expect(j.active).toBe(false);
    expect(j.schedule).toBe("1 second");
    expect(j.command).toContain("synthetic-only");
    expect(j.command).toContain("/api/public/hooks/process-mimo-agente");
    expect(j.command).not.toContain("process-mimo-recuperacao");
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM cron.job")).rows[0].n).toBe(
      2,
    );
    await db.exec("UPDATE cron.job SET active=true WHERE jobname='mimo-agente-whatsapp'");
    await db.exec(setup);
    j = await job(db);
    expect(j.active).toBe(true);
    expect(
      (
        await db.query<{ command: string }>(
          "SELECT command FROM cron.job WHERE jobname='mimo-recuperacao-whatsapp'",
        )
      ).rows[0].command,
    ).toBe(source);
  } finally {
    await db.close();
  }
});
it("não chama HTTP com fila vazia, desativada, manual ou ainda não vencida", async () => {
  const db = await database();
  try {
    await db.exec(setup);
    const j = await job(db);
    await db.exec(j.command);
    expect(await calls(db)).toBe(0);
    await db.exec(
      "INSERT INTO mimo_agente_config VALUES(1,'desativado');INSERT INTO mimo_agente_fila VALUES(1,'pendente',NULL,NULL,now()-interval '1 minute')",
    );
    await db.exec(j.command);
    expect(await calls(db)).toBe(0);
    await db.exec(
      "UPDATE mimo_agente_config SET modo='piloto';UPDATE mimo_agente_fila SET solicitado_por='10000000-0000-4000-8000-000000000001'",
    );
    await db.exec(j.command);
    expect(await calls(db)).toBe(0);
    await db.exec(
      "UPDATE mimo_agente_fila SET solicitado_por=NULL,executar_em=now()+interval '1 hour'",
    );
    await db.exec(j.command);
    expect(await calls(db)).toBe(0);
    await db.exec("UPDATE mimo_agente_fila SET executar_em=now()-interval '1 minute'");
    await db.exec(j.command);
    expect(await calls(db)).toBe(1);
    await db.exec("UPDATE mimo_agente_config SET modo='ativo'");
    await db.exec(j.command);
    expect(await calls(db)).toBe(2);
  } finally {
    await db.close();
  }
});
it("permite limpar reservas interrompidas mesmo com o agente desativado", async () => {
  const db = await database();
  try {
    await db.exec(setup);
    const j = await job(db);
    await db.exec(
      "INSERT INTO mimo_agente_config VALUES(1,'desativado');INSERT INTO mimo_agente_fila VALUES(1,'reservada',now()-interval '4 minutes',NULL,now())",
    );
    await db.exec(j.command);
    expect(await calls(db)).toBe(1);
    await db.exec("UPDATE mimo_agente_fila SET estado='enviando'");
    await db.exec(j.command);
    expect(await calls(db)).toBe(2);
    await db.exec("UPDATE mimo_agente_fila SET reservada_em=now()");
    await db.exec(j.command);
    expect(await calls(db)).toBe(2);
  } finally {
    await db.close();
  }
});
it("recusa transporte ausente, pausado, sem segredo ou com rota duplicada sem criar job", async () => {
  const db = await database();
  try {
    await db.exec("UPDATE cron.job SET active=false");
    await expect(db.exec(setup)).rejects.toThrow();
    expect(await job(db)).toBeUndefined();
    await db.exec("UPDATE cron.job SET active=true,command='SELECT 1'");
    await expect(db.exec(setup)).rejects.toThrow("Existing server transport requires review");
    await db.query("UPDATE cron.job SET command=$1", [
      source.replace("x-cron-secret", "other-header"),
    ]);
    await expect(db.exec(setup)).rejects.toThrow("requires review");
    await db.query("UPDATE cron.job SET command=$1", [source + source]);
    await expect(db.exec(setup)).rejects.toThrow("requires review");
    expect(await job(db)).toBeUndefined();
    await db.exec("DELETE FROM cron.job");
    await expect(db.exec(setup)).rejects.toThrow();
  } finally {
    await db.close();
  }
});
it("não sobrescreve um job homônimo com configuração diferente", async () => {
  const db = await database();
  try {
    await db.exec(
      "INSERT INTO cron.job(jobname,schedule,command) VALUES('mimo-agente-whatsapp','* * * * *','SELECT 1')",
    );
    await expect(db.exec(setup)).rejects.toThrow("Existing agent schedule requires review");
    expect((await job(db)).command).toBe("SELECT 1");
  } finally {
    await db.close();
  }
});
it("uma falha tardia reverte a criação e a alteração do job na mesma transação", async () => {
  const db = await database();
  try {
    const failing = setup.replace(
      "END $mimo_agente_schedule$;",
      "RAISE EXCEPTION 'synthetic_late_failure'; END $mimo_agente_schedule$;",
    );
    await expect(db.exec(failing)).rejects.toThrow("synthetic_late_failure");
    expect(await job(db)).toBeUndefined();
    expect(
      (
        await db.query<{ active: boolean }>(
          "SELECT active FROM cron.job WHERE jobname='mimo-recuperacao-whatsapp'",
        )
      ).rows[0].active,
    ).toBe(true);
    await db.exec(setup);
    expect((await job(db)).active).toBe(false);
  } finally {
    await db.close();
  }
});
