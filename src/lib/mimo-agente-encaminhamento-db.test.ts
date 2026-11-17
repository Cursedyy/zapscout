import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { configInicialAgente } from "./mimo-agente";
const emp = "10000000-0000-4000-8000-000000000001",
  admin = "20000000-0000-4000-8000-000000000001",
  seller = "20000000-0000-4000-8000-000000000002",
  other = "20000000-0000-4000-8000-000000000003",
  binding = "30000000-0000-4000-8000-000000000001";
it("encaminhamento: outbox atômica, nova resposta, dedupe, pausa e aceite incerto", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.uid',true),'')::uuid$$;
 CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
 CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p))$$;
 CREATE FUNCTION is_membro_empresa(e uuid,u uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo)$$;
 CREATE FUNCTION empresa_papel_de(e uuid,u uuid) RETURNS empresa_papel LANGUAGE sql SECURITY DEFINER AS $$SELECT papel FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo$$;
 CREATE TABLE teste_relogio(t timestamptz);INSERT INTO teste_relogio VALUES('2026-11-06T12:00:00Z');CREATE FUNCTION teste_agora() RETURNS timestamptz LANGUAGE sql AS $$SELECT t FROM teste_relogio$$;
 INSERT INTO empresas VALUES('${emp}','mimo',true);INSERT INTO empresa_membros VALUES('${emp}','${admin}','administrador',true),('${emp}','${seller}','vendedor',true),('${emp}','${other}','vendedor',true);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
    await db.exec(
      "GRANT SELECT,UPDATE ON teste_relogio TO service_role;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(bucket_id text,name text);",
    );
    const sql = (p: string) =>
      readFileSync(p, "utf8")
        .replaceAll("clock_timestamp()", "public.teste_agora()")
        .replaceAll("now()", "public.teste_agora()");
    await db.exec(sql("drizzle/migrations/0008_mimo_leads_comerciais.sql"));
    await db.exec(sql("drizzle/migrations/0009_mimo_whatsapp_recebimento.sql"));
    const prepared = sql("docs/migracoes-preparadas/mimo-agente.sql");
    await expect(
      db.exec(`DO $test$ BEGIN ${prepared} RAISE EXCEPTION 'rollback_sintetico'; END $test$;`),
    ).rejects.toThrow("rollback_sintetico");
    expect((await db.query("SELECT to_regclass('mimo_agente_config') AS t")).rows).toEqual([
      { t: null },
    ]);
    await db.exec(prepared);
    await db.exec(
      `INSERT INTO mimo_whatsapp_vinculos(id,empresa_id,owner_id,numero_comercial,token_sha256,ativo,confirmado_por) VALUES('${binding}','${emp}','${admin}','5511888888888',repeat('a',64),true,'${admin}')`,
    );


    await db.exec("CREATE TABLE mimo_follow_aviso_config(empresa_id uuid,membro_id uuid,numero text); CREATE FUNCTION mimo_follow_history_imutavel() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'imutavel';END$$;");
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-observacao-quentes.sql"));
    await db.exec(sql("docs/migracoes-preparadas/mimo-quentes-grupo.sql"));
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-followup-2h.sql"));
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-encaminhamento-grupo.sql"));
    await db.query("INSERT INTO mimo_agente_config(empresa_id,publicada,modo,vinculo_id,atualizado_por) VALUES($1,1,'ativo',$2,$3)",[emp,binding,admin]);
    await db.query("INSERT INTO mimo_agente_versoes(empresa_id,versao,config,ator_id) VALUES($1,1,$2,$3)",[emp,JSON.stringify(configInicialAgente),admin]);
    await db.query("INSERT INTO mimo_agente_observacao_config(empresa_id,vinculo_id,destino,ativo,inicio_em,atualizado_por,grupo_nome,grupo_jid,grupo_status) VALUES($1,$2,'120363000000000001@g.us',true,teste_agora(),$3,'leads quentes','120363000000000001@g.us','ativo')",[emp,binding,admin]);
    const op=async(a:string,p:unknown={})=>(await db.query<{r:any}>("SELECT mimo_quentes_operar($1,$2::jsonb) r",[a,JSON.stringify(p)])).rows[0].r;
    const worker=async(a:string,p:unknown)=>(await db.query<{r:any}>("SELECT mimo_agente_worker($1,$2::jsonb) r",[a,JSON.stringify(p)])).rows[0].r;
    const repair=async(id:string)=>(await db.query<{r:string|null}>("SELECT mimo_agente_encaminhar_grupo($1,true) r",[id])).rows[0].r;
    const seed=async(n:number,estado="humano",piloto=false,manual=false)=>{
      const lead=crypto.randomUUID(),conversa=crypto.randomUUID(),id=crypto.randomUUID(),reserva=crypto.randomUUID(),evento=crypto.randomUUID();
      const tel='551199999'+String(n).padStart(4,'0');
      await db.query("INSERT INTO mimo_leads(id,empresa_id,nome_empresa,telefone,created_by) VALUES($1,$2,'Contato sintético',$3,$4)",[lead,emp,tel,admin]);
      await db.query("INSERT INTO mimo_agente_conversas(id,empresa_id,lead_id,vinculo_id,telefone,piloto,sequencia) VALUES($1,$2,$3,$4,$5,$6,1)",[conversa,emp,lead,binding,tel,piloto]);
      await db.query("INSERT INTO mimo_whatsapp_eventos(id,empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em) VALUES($1,$2,$3,$4,$5,'recebida','É sem adição de açúcar?',teste_agora())",[evento,emp,binding,'in'+n,lead]);
      await db.query("INSERT INTO mimo_agente_analises(empresa_id,lead_id,evento_id,estado,executar_em) VALUES($1,$2,$3,'concluida',teste_agora())",[emp,lead,evento]);
      const resultado={estado,resposta:'Vou encaminhar à equipe.',dados:{nome:{valor:'Pessoa sintética',evidencia:'Pessoa sintética'}},resumo:'',motivo:'promessa_encaminhamento'};
      await db.query("INSERT INTO mimo_agente_fila(id,empresa_id,conversa_id,sequencia,versao,estado,executar_em,reserva,reservada_em,resposta,resultado,solicitado_por) VALUES($1,$2,$3,1,1,'enviando',teste_agora(),$4,teste_agora(),$5,$6,$7)",[id,emp,conversa,reserva,resultado.resposta,JSON.stringify(resultado),manual?admin:null]);
      return {id,reserva,lead,conversa};
    };
    const finish=async(q:Awaited<ReturnType<typeof seed>>)=>worker('enviada',{...q,messageId:'out-'+q.id});
    const a=await seed(1);
    expect(await finish(a)).toBe(true);
    let q=await op('reservar_alerta');
    expect(q.encaminhamento_fila_id).toBe(a.id);
    expect(q.sinal.quente).toBe(false);
    expect(q.sinal.evidencias.some((e:any)=>e.trecho.includes('açúcar'))).toBe(true);
    expect(q.sinal.evidencias.some((e:any)=>e.trecho.includes('Pessoa sintética'))).toBe(true);
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_sinais WHERE quente")).rows).toEqual([{n:0}]);
    // Incoming acknowledgements must not cancel an already promised handoff.
    await db.query("INSERT INTO mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,direcao,texto,contato_em) VALUES($1,$2,'ack','recebida','Ok',teste_agora())",[emp,binding]);
    await db.query("UPDATE mimo_whatsapp_eventos SET lead_id=$1 WHERE message_id='ack'",[a.lead]);
    expect(await op('autorizar_alerta',q)).toBe(true);
    await op('finalizar_alerta',{...q,message_id:'group-accepted'});
    expect(await repair(a.id)).toBe(q.id);
    expect(await op('reservar_alerta')).toBeNull();
    // No second notice after success, even if the scheduling call repeats.
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_alertas WHERE lead_id=$1",[a.lead])).rows).toEqual([{n:1}]);
    // A pending classifier notice is superseded by the durable handoff, not duplicated.
    const b=await seed(2);
    await db.query("INSERT INTO mimo_agente_alertas(empresa_id,lead_id,tipo,config_versao,sequencia,destino,vinculo_id) VALUES($1,$2,'lead',1,1,'120363000000000001@g.us',$3)",[emp,b.lead,binding]);
    await finish(b);
    expect((await db.query("SELECT estado FROM mimo_agente_alertas WHERE lead_id=$1 AND encaminhamento_fila_id IS NULL",[b.lead])).rows).toEqual([{estado:'cancelada'}]);
    const repetida=crypto.randomUUID();
    await db.query("INSERT INTO mimo_agente_fila(id,empresa_id,conversa_id,sequencia,versao,estado,executar_em,message_id,resultado) SELECT $1,empresa_id,conversa_id,2,versao,'enviada',teste_agora(),'out-repetida',resultado FROM mimo_agente_fila WHERE id=$2",[repetida,b.id]);
    expect(await repair(repetida)).toBe(await repair(b.id));
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_alertas WHERE lead_id=$1 AND encaminhamento_fila_id IS NOT NULL",[b.lead])).rows).toEqual([{n:1}]);
    q=await op('reservar_alerta');
    expect(q.encaminhamento_fila_id).toBe(b.id);
    expect(await op('autorizar_alerta',q)).toBe(true);
    await op('finalizar_alerta',{...q,message_id:null});
    expect(await repair(b.id)).toBe(q.id);
    expect(await op('reservar_alerta')).toBeNull();
    // Pause still wins at the final send boundary.
    const c=await seed(3);await finish(c);q=await op('reservar_alerta');
    await db.exec("UPDATE mimo_agente_observacao_config SET ativo=false");
    expect(await op('autorizar_alerta',q)).toBe(false);
    await db.exec("UPDATE mimo_agente_observacao_config SET ativo=true");
    for(const t of [await seed(4,'agente'),await seed(5,'humano',true),await seed(6,'humano',false,true)]){
      await finish(t);expect(await repair(t.id)).toBeNull();
    }
    // Final message recording and handoff outbox roll back together.
    const rollback=await seed(7);
    await db.exec("BEGIN");
    await finish(rollback);
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_alertas WHERE encaminhamento_fila_id=$1",[rollback.id])).rows).toEqual([{n:1}]);
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_alertas WHERE encaminhamento_fila_id=$1",[rollback.id])).rows).toEqual([{n:0}]);
    expect((await db.query("SELECT estado FROM mimo_agente_fila WHERE id=$1",[rollback.id])).rows).toEqual([{estado:'enviando'}]);
    // No retroactive notification without explicitly requesting repair.
    const old=await seed(8);
    await db.exec("UPDATE mimo_agente_observacao_config SET inicio_em=teste_agora()+interval '1 minute'");
    await finish(old);
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_alertas WHERE encaminhamento_fila_id=$1",[old.id])).rows).toEqual([{n:0}]);
    expect(await repair(old.id)).toBeTruthy();
    await db.exec("SET ROLE authenticated");
    await expect(repair(old.id)).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE;SET ROLE anon");
    await expect(repair(old.id)).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  } finally { await db.close(); }
});
