import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { followupNoPrazoAgente } from "./mimo-agente";

const ancora = "2026-11-24T12:00:00.000Z";
const em = (ms: number) => new Date(Date.parse(ancora) + ms);
const min = 60_000;

describe("prazos dos lembretes 1h/3h com relógio controlado", () => {
  it("etapa 1 só a partir de 1h de silêncio", () => {
    expect(followupNoPrazoAgente(1, ancora, em(40 * min))).toBe(false);
    expect(followupNoPrazoAgente(1, ancora, em(60 * min - 1000))).toBe(false);
    expect(followupNoPrazoAgente(1, ancora, em(60 * min))).toBe(true);
  });
  it("etapa 2 só a partir de 3h totais da mesma âncora, nunca 1h+3h", () => {
    expect(followupNoPrazoAgente(2, ancora, em(180 * min - 1000))).toBe(false);
    expect(followupNoPrazoAgente(2, ancora, em(180 * min))).toBe(true);
    expect(followupNoPrazoAgente(2, ancora, em(240 * min))).toBe(true);
  });
  it("sem âncora válida não envia", () => {
    for (const [e, s] of [[1, null], [3, ancora], [1, "x"], [1, em(60 * min).toISOString()]] as const)
      expect(followupNoPrazoAgente(e, s, em(0))).toBe(false);
  });
  it("migração preparada só troca 40 minutos por 1 hora e mantém 3h", () => {
    const sql = readFileSync("docs/migracoes-preparadas/mimo-agente-followup-1h-3h.sql", "utf8");
    expect(sql).not.toMatch(/40 minutes/);
    expect(sql.match(/interval '1 hour'/g)).toHaveLength(2);
    expect(sql.match(/interval '3 hours'/g)).toHaveLength(2);
    expect(sql).toMatch(/s\.entrada_id=ultima\.id/);
  });
  it("agendador com a migração: 59:59 não, 1h sim, 2ª só às 3h da mesma mensagem", async () => {
    const db = new PGlite();
    await db.exec(`CREATE TABLE teste_relogio(t timestamptz);INSERT INTO teste_relogio VALUES('${ancora}');
      CREATE FUNCTION teste_agora() RETURNS timestamptz LANGUAGE sql AS $$SELECT t FROM teste_relogio$$;`);
    // Minimal synthetic tables with only the columns the scheduler reads.
    await db.exec(`
      CREATE TABLE mimo_agente_config(empresa_id uuid PRIMARY KEY,modo text,publicada int,vinculo_id uuid);
      CREATE TABLE mimo_agente_followup_config(empresa_id uuid,ativo boolean,inicio_em timestamptz);
      CREATE TABLE mimo_agente_conversas(id uuid PRIMARY KEY,empresa_id uuid,lead_id uuid,vinculo_id uuid,estado text,piloto boolean,followup_bloqueado boolean,sequencia int,created_at timestamptz DEFAULT teste_agora());
      CREATE TABLE mimo_agente_followup_envios(conversa_id uuid,empresa_id uuid,fila_id uuid,origem_id uuid,etapa int,entrada_id uuid,silencio_em timestamptz,duas_etapas boolean DEFAULT true);
      CREATE TABLE mimo_agente_fila(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid,conversa_id uuid,sequencia int,versao int,estado text DEFAULT 'pendente',solicitado_por uuid,resultado jsonb,message_id text,executar_em timestamptz,motivo text);
      CREATE TABLE mimo_whatsapp_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid,lead_id uuid,vinculo_id uuid,direcao text,message_id text,created_at timestamptz);
      CREATE TABLE mimo_agente_alertas(empresa_id uuid,lead_id uuid,tipo text,estado text);
      CREATE TABLE mimo_leads(id uuid,empresa_id uuid,etapa text,qualificacao text);
      CREATE TABLE mimo_agente_historico(empresa_id uuid,conversa_id uuid,acao text,dados jsonb);`);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-agente-followup-1h-3h.sql", "utf8").replaceAll("clock_timestamp()", "public.teste_agora()"));
    const e = crypto.randomUUID(), v = crypto.randomUUID(), l = crypto.randomUUID(), c = crypto.randomUUID();
    await db.query("INSERT INTO mimo_agente_config VALUES($1,'ativo',1,$2)", [e, v]);
    await db.query("INSERT INTO mimo_agente_followup_config VALUES($1,true,teste_agora()-interval '1 day')", [e]);
    await db.query("INSERT INTO mimo_leads VALUES($1,$2,'novo','pendente')", [l, e]);
    await db.query("INSERT INTO mimo_agente_conversas(id,empresa_id,lead_id,vinculo_id,estado,piloto,followup_bloqueado,sequencia) VALUES($1,$2,$3,$4,'agente',false,false,1)", [c, e, l, v]);
    await db.query("INSERT INTO mimo_whatsapp_eventos(empresa_id,lead_id,vinculo_id,direcao,message_id,created_at) VALUES($1,$2,$3,'recebida','in1',teste_agora())", [e, l, v]);
    const resposta = async () => {
      const s = (await db.query<{ s: number }>("SELECT sequencia s FROM mimo_agente_conversas WHERE id=$1", [c])).rows[0]!.s;
      const id = `out${s}`;
      await db.query("INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,estado,resultado,message_id) VALUES($1,$2,$3,1,'enviada','{\"estado\":\"agente\"}',$4) ON CONFLICT DO NOTHING", [e, c, s, id]);
      await db.query("UPDATE mimo_agente_fila SET estado='enviada',resultado='{\"estado\":\"agente\"}',message_id=$3 WHERE conversa_id=$1 AND sequencia=$2", [c, s, id]);
      await db.query("INSERT INTO mimo_whatsapp_eventos(empresa_id,lead_id,vinculo_id,direcao,message_id,created_at) VALUES($1,$2,$3,'enviada',$4,teste_agora()+interval '1 second')", [e, l, v, id]);
    };
    await resposta();
    const agendar = async () => (await db.query<{ n: number }>("SELECT mimo_agente_followup_agendar() n")).rows[0]!.n;
    const relogio = (x: string) => db.exec(`UPDATE teste_relogio SET t='${ancora}'::timestamptz+interval '${x}'`);
    await relogio("40 minutes"); expect(await agendar()).toBe(0);
    await relogio("59 minutes 59 seconds"); expect(await agendar()).toBe(0);
    await relogio("1 hour 1 second"); expect(await agendar()).toBe(1);
    expect(await agendar()).toBe(0);
    await resposta(); // first reminder accepted by the provider
    await relogio("2 hours 59 minutes 58 seconds"); expect(await agendar()).toBe(0);
    await relogio("3 hours 1 second"); expect(await agendar()).toBe(1);
    const envios = (await db.query<{ etapa: number; silencio_em: Date }>("SELECT etapa,silencio_em FROM mimo_agente_followup_envios ORDER BY etapa")).rows;
    expect(envios.map((x) => x.etapa)).toEqual([1, 2]);
    expect(envios[0]!.silencio_em.toISOString()).toBe(envios[1]!.silencio_em.toISOString());
    await resposta();
    await relogio("10 hours"); expect(await agendar()).toBe(0); // never a third
    await db.close();
  });
});
