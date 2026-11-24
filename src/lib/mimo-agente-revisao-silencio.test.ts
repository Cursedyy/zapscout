import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("move apenas leads elegíveis e registra a revisão por silêncio uma vez", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA cron;
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
      CREATE FUNCTION public.agora_teste() RETURNS timestamptz LANGUAGE sql AS
        $$SELECT '2026-11-26T18:00:00Z'::timestamptz$$;
      CREATE TABLE empresas(id text PRIMARY KEY, ativa boolean);
      CREATE TABLE mimo_agente_config(empresa_id text, vinculo_id text, modo text);
      CREATE TABLE mimo_agente_conversas(id text PRIMARY KEY, empresa_id text, vinculo_id text, lead_id text,
        sequencia integer, estado text, piloto boolean, followup_bloqueado boolean, motivo text, updated_at timestamptz);
      CREATE TABLE mimo_leads(id text PRIMARY KEY, empresa_id text, qualificacao text, etapa text, responsavel_id text);
      CREATE TABLE mimo_agente_fila(id text PRIMARY KEY, conversa_id text, empresa_id text,
        sequencia integer, estado text, solicitado_por text, message_id text);
      CREATE TABLE mimo_agente_followup_envios(fila_id text, empresa_id text, conversa_id text);
      CREATE TABLE mimo_whatsapp_eventos(id integer GENERATED ALWAYS AS IDENTITY, empresa_id text,
        lead_id text, message_id text, direcao text, created_at timestamptz);
      CREATE TABLE mimo_agente_alertas(empresa_id text, lead_id text, tipo text, estado text);
      CREATE TABLE mimo_agente_historico(id integer GENERATED ALWAYS AS IDENTITY, empresa_id text, conversa_id text, acao text, dados jsonb);
      INSERT INTO empresas VALUES ('empresa',true);
      INSERT INTO mimo_agente_config VALUES ('empresa','canal','ativo');
      INSERT INTO mimo_leads
        SELECT i::text,'empresa',CASE WHEN i=4 THEN 'nao_qualificado' ELSE 'pendente' END,'novo',
          CASE WHEN i=6 THEN 'responsavel' END FROM generate_series(1,7) i;
      INSERT INTO mimo_agente_conversas
        SELECT i::text,'empresa','canal',i::text,1,'agente',false,i=7,'',agora_teste() FROM generate_series(1,7) i;
      INSERT INTO mimo_agente_fila
        SELECT i::text,i::text,'empresa',1,'enviada',NULL,'msg-'||i FROM generate_series(1,7) i;
      INSERT INTO mimo_agente_followup_envios SELECT i::text,'empresa',i::text FROM generate_series(1,7) i;
      INSERT INTO mimo_whatsapp_eventos(empresa_id,lead_id,message_id,direcao,created_at)
        SELECT 'empresa',i::text,'msg-'||i,'enviada',agora_teste()-CASE WHEN i=2 THEN interval '47 hours 59 minutes'
          ELSE interval '48 hours' END FROM generate_series(1,7) i;
      INSERT INTO mimo_whatsapp_eventos(empresa_id,lead_id,message_id,direcao,created_at)
        VALUES ('empresa','3','resposta','recebida',agora_teste()-interval '1 hour');
      INSERT INTO mimo_agente_alertas VALUES ('empresa','5','lead','aceita');
    `);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-agente-revisao-silencio.sql", "utf8")
      .replaceAll("clock_timestamp()", "public.agora_teste()"));
    const executar = () => db.query("SELECT mimo_agente_revisao_silencio_agendar() AS total");
    expect((await executar()).rows).toEqual([{ total: 1 }]);
    expect((await db.query("SELECT id,motivo FROM mimo_agente_conversas WHERE estado='humano'")).rows)
      .toEqual([{ id: "1", motivo: "sem_resposta_apos_followup" }]);
    expect((await db.query("SELECT dados->>'horas_sem_resposta' AS horas FROM mimo_agente_historico")).rows)
      .toEqual([{ horas: "48" }]);
    await db.exec("UPDATE mimo_agente_conversas SET estado='agente' WHERE id='1'");
    expect((await executar()).rows).toEqual([{ total: 0 }]);
    expect((await db.query("SELECT qualificacao FROM mimo_leads WHERE id='1'")).rows)
      .toEqual([{ qualificacao: "pendente" }]);
  } finally {
    await db.close();
  }
});
