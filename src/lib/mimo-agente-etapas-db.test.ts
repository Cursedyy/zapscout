import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { configInicialAgente, encerramentoRevendaAgente, parceriaInfluenciaAgente, representacaoAgente } from "./mimo-agente";
import { idEnvioMimo } from "./mimo-whatsapp";
const emp = "10000000-0000-4000-8000-000000000001",
  admin = "20000000-0000-4000-8000-000000000001",
  seller = "20000000-0000-4000-8000-000000000002",
  other = "20000000-0000-4000-8000-000000000003",
  binding = "30000000-0000-4000-8000-000000000001";
it("follow-ups legados 40min/3h: prazo, resposta, escalonamento e autorização final", async () => {
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
        .replace(/\r\n/g, "\n")
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

    await db.exec("CREATE TABLE mimo_agente_alertas(empresa_id uuid,lead_id uuid,tipo text,estado text);");
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-followup-2h.sql"));
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-followup-etapas.sql"));
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-audio.sql")
      .replaceAll("[Transcrição de áudio]", "[TranscriÃ§Ã£o de Ã¡udio]"));
    const marcadorUtf8 = sql("docs/migracoes-preparadas/mimo-agente-audio-marcador-utf8.sql");
    await db.exec(marcadorUtf8);
    await db.exec(marcadorUtf8);
    await db.exec(sql("docs/migracoes-preparadas/mimo-whatsapp-nome-curto.sql"));
    await db.query("INSERT INTO mimo_agente_config(empresa_id,publicada,modo,vinculo_id,atualizado_por) VALUES($1,1,'ativo',$2,$3)",[emp,binding,admin]);
    await db.query("INSERT INTO mimo_agente_versoes(empresa_id,versao,config,ator_id) VALUES($1,1,$2,$3)",[emp,JSON.stringify(configInicialAgente),admin]);
    await db.query("INSERT INTO mimo_agente_followup_config(empresa_id,ativo,inicio_em) VALUES($1,true,teste_agora())",[emp]);
    const seed=async(n:number)=>{
      const lead=crypto.randomUUID(),conv=crypto.randomUUID();
      await db.query("INSERT INTO mimo_leads(id,empresa_id,nome_empresa,telefone,created_by) VALUES($1,$2,'Contato sintetico',$3,$4)",[lead,emp,'551199999'+String(n).padStart(4,'0'),admin]);
      await db.query("INSERT INTO mimo_agente_conversas(id,empresa_id,lead_id,vinculo_id,telefone,piloto,sequencia) VALUES($1,$2,$3,$4,$5,false,1)",[conv,emp,lead,binding,'551199999'+String(n).padStart(4,'0')]);
      await db.query("INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,estado,executar_em,message_id,resultado) VALUES($1,$2,1,1,'enviada',teste_agora(),$3,'{\"estado\":\"agente\"}')",[emp,conv,'sent'+n]);
      await db.query("INSERT INTO mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em) VALUES($1,$2,$3,$4,'enviada','Ola',teste_agora())",[emp,binding,'sent'+n,lead]);
      await db.query("INSERT INTO mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em,created_at) VALUES($1,$2,$3,$4,'recebida','Tenho interesse',teste_agora(),teste_agora())",[emp,binding,'in'+n,lead]);
      await db.query("UPDATE mimo_whatsapp_eventos SET created_at=teste_agora()+interval '1 second' WHERE message_id=$1",['sent'+n]);
      return conv;
    };
    const schedule=async()=> (await db.query<{n:number}>("SELECT mimo_agente_followup_agendar() n")).rows[0].n;
    const worker=async(acao:string,p:unknown={})=>(await db.query<{r:any}>("SELECT mimo_agente_worker($1,$2::jsonb) r",[acao,JSON.stringify(p)])).rows[0].r;
    const advance=async()=>db.exec("UPDATE teste_relogio SET t=t+interval '40 minutes'");
    const c1=await seed(1);
    expect(await schedule()).toBe(0);
    await db.exec("UPDATE teste_relogio SET t=t+interval '39 minutes 59 seconds'");
    expect(await schedule()).toBe(0);
    await db.exec("UPDATE teste_relogio SET t=t+interval '1 second'");
    expect(await schedule()).toBe(1);
    expect(await schedule()).toBe(0);
    const task=await worker('reservar');
    expect(task.followup).toBe(true);expect(task.followupEtapa).toBe(1);expect(task.catalogoApresentado).toBe(false);
    // A customer reply after reservation invalidates the sequence and cancels the reminder.
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'reply','recebida','Tenho interesse')",[c1]);
    expect(await worker('validar',task)).toBe(false);
    expect(await worker('autorizar',{...task,resultado:{resposta:'lembrete',estado:'agente'}})).toBe(false);
    await db.query("UPDATE mimo_agente_fila SET estado='cancelada' WHERE conversa_id=$1 AND estado='pendente'",[c1]);
    const c2=await seed(2);
    await db.query("UPDATE mimo_agente_conversas SET estado='humano' WHERE id=$1",[c2]);
    await db.query("UPDATE mimo_agente_conversas SET estado='agente',followup_bloqueado=false WHERE id=$1",[c2]);
    await advance();
    expect(await schedule()).toBe(0);
    const c3=await seed(3);
    await advance(); expect(await schedule()).toBe(1);
    const t3=await worker('reservar');expect(t3.conversa).toBe(c3);
    await db.query("UPDATE mimo_agente_conversas SET estado='humano' WHERE id=$1",[c3]);
    expect(await worker('autorizar',{...t3,resultado:{resposta:'lembrete',estado:'agente'}})).toBe(false);
    await worker('cancelar',t3);
    const c4=await seed(4);await advance();expect(await schedule()).toBe(1);
    const t4=await worker('reservar');
    await db.exec("UPDATE mimo_agente_followup_config SET ativo=false");
    expect(await worker('validar',t4)).toBe(false);
    expect(await worker('autorizar',{...t4,resultado:{resposta:'lembrete',estado:'agente'}})).toBe(false);
    await worker('cancelar',t4);

    await db.exec("UPDATE mimo_agente_followup_config SET ativo=true");
    const c5=await seed(5);await advance();expect(await schedule()).toBe(1);
    const t5=await worker('reservar');
    expect(await worker('autorizar',{...t5,resultado:{resposta:'Lembrete sintetico',estado:'agente',dados:{},motivo:''}})).toBe(true);
    await worker('incerta',t5);
    expect(await schedule()).toBe(0);
    expect((await db.query<{estado:string}>("SELECT estado FROM mimo_agente_conversas WHERE id=$1",[c5])).rows[0].estado).toBe('humano');
    const c6=await seed(6);await advance();expect(await schedule()).toBe(1);
    const t6=await worker('reservar');
    expect(await worker('autorizar',{...t6,resultado:{resposta:'Lembrete sintetico',estado:'agente',dados:{},motivo:''}})).toBe(true);
    await worker('enviada',{...t6,messageId:'followup-aceito'});
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'followup-aceito','enviada','Lembrete sintetico')",[c6]);
    expect((await db.query<{estado:string}>("SELECT estado FROM mimo_agente_conversas WHERE id=$1",[c6])).rows[0].estado).toBe('agente');
    await advance();expect(await schedule()).toBe(0);
    await db.exec("UPDATE teste_relogio SET t=t+interval '99 minutes 59 seconds'");
    expect(await schedule()).toBe(0);
    await db.exec("UPDATE teste_relogio SET t=t+interval '1 second'");
    expect(await schedule()).toBe(1);
    const t62=await worker('reservar');expect(t62.followupEtapa).toBe(2);
    expect(t62.conversa).toBe(c6);
    // A classification changed after reservation still cancels the second reminder.
    await db.query("UPDATE mimo_leads SET qualificacao='qualificado' WHERE id=(SELECT lead_id FROM mimo_agente_conversas WHERE id=$1)",[c6]);
    expect(await worker('autorizar',{...t62,resultado:{resposta:'Lembrete',estado:'agente'}})).toBe(false);
    await worker('cancelar',t62);
    await advance();expect(await schedule()).toBe(0);
    const c7=await seed(7);
    await db.query("INSERT INTO mimo_agente_alertas SELECT empresa_id,lead_id,'lead','aceita' FROM mimo_agente_conversas WHERE id=$1",[c7]);
    await advance();expect(await schedule()).toBe(0);
    const c8=await seed(8);
    await db.exec("UPDATE teste_relogio SET t=t+interval '2 seconds'");
    const audioId=crypto.randomUUID();
    await db.query("INSERT INTO mimo_whatsapp_eventos(id,empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em) SELECT $1,empresa_id,vinculo_id,'audio-8',lead_id,'recebida','[audio]',teste_agora() FROM mimo_agente_conversas WHERE id=$2",[audioId,c8]);
    await db.query("SELECT mimo_agente_enfileirar($1,$2,'audio-8','recebida','[audio]')",[c8,audioId]);
    await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'");
    const t8=await worker('reservar');expect(t8.conversa).toBe(c8);
    expect(t8.mensagens).toContainEqual(expect.objectContaining({messageId:'audio-8',content:'[audio]'}));
    const audio=async(p:unknown)=>(await db.query<{r:any}>("SELECT mimo_agente_audio($1::jsonb) r",[JSON.stringify(p)])).rows[0].r;
    expect(await audio(t8)).toEqual([{id:audioId,messageId:'audio-8'}]);
    expect(await audio({...t8,evento:crypto.randomUUID(),texto:'Fala inválida'})).toBeNull();
    expect(await audio({...t8,evento:audioId,texto:'Sou Ana, quero revender em SC'})).toEqual({texto:'[Transcrição de áudio]\nSou Ana, quero revender em SC'});
    expect((await db.query("SELECT texto FROM mimo_whatsapp_eventos WHERE id=$1", [audioId])).rows)
      .toEqual([{ texto: "[Transcrição de áudio]\nSou Ana, quero revender em SC" }]);
    expect(await audio({...t8,evento:audioId,texto:'Não sobrescrever'})).toBeNull();
    await db.query("UPDATE mimo_agente_conversas SET estado='humano' WHERE id=$1",[c8]);
    expect(await audio(t8)).toBeNull();
    const novo=(await db.query<{id:string}>("SELECT mimo_receber_whatsapp($1,$2,repeat('a',64),'nome-curto','5511998880000','💕','Olá',teste_agora(),false) id",[binding,admin])).rows[0].id;
    expect(novo).toBeTruthy();
    expect((await db.query("SELECT nome_empresa,nome_contato FROM mimo_leads WHERE id=$1",[novo])).rows).toEqual([{nome_empresa:'5511998880000',nome_contato:'💕'}]);

    await db.exec(`ALTER TABLE mimo_agente_alertas ADD COLUMN encaminhamento_fila_id uuid;
      CREATE TABLE uazapi_instancias (id uuid, user_id uuid, tipo text CHECK (tipo='principal'));
      CREATE TABLE mimo_tira_pedidos (id uuid, empresa_id uuid, lead_id uuid, status text, total bigint);
      CREATE TABLE mimo_tira_versoes (empresa_id uuid, pedido_id uuid, created_at timestamptz, snapshot jsonb);
      CREATE FUNCTION pode_ver_mimo_lead(l uuid,u uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS (SELECT 1 FROM mimo_leads x JOIN empresa_membros m USING (empresa_id) WHERE x.id=l AND m.user_id=u AND m.ativo) $$;`);
    for (const file of [
      "0013_mimo_perdas_duplicados_prioridade.sql",
      "0042_mimo_lead_followups.sql",
      "0043_mimo_comercial_numeros_avisos.sql",
      "0049_mimo_retomada_historica.sql",
      "0050_mimo_retomada_exigir_ultima_saida.sql",
      "0051_mimo_agente_sem_teto_diario.sql",
      "0053_mimo_agente_exclusoes_telefones.sql",
    ]) await db.exec(sql(`drizzle/migrations/${file}`));
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-recusa-revenda.sql"));

    const c9=await seed(9);
    const recusa="Não quero mais revender, obrigada!";
    const resultado=encerramentoRevendaAgente([{role:"user",content:recusa}],{});
    expect(resultado?.motivo).toBe("falta_interesse");
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'no-interest','recebida',$2)",[c9,recusa]);
    await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'");
    const t9=await worker('reservar');
    expect(t9).toMatchObject({conversa:c9,encerramentoRevenda:true,followup:false});
    await db.query(`INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,estado,executar_em,motivo)
      VALUES($1,$2,99,1,'pendente',teste_agora()+interval '2 hours','followup_2h')`,[emp,c9]);
    await db.query("INSERT INTO mimo_follow_aviso_config(empresa_id,membro_id,vinculo_id,numero,confirmado_por) VALUES($1,$2,$3,'5511999000001',$4)",[emp,seller,binding,admin]);
    await db.query(`INSERT INTO mimo_lead_followups(id,empresa_id,lead_id,responsavel_id,prazo,observacao)
      SELECT gen_random_uuid(),empresa_id,lead_id,$2,teste_agora(),'Sintético' FROM mimo_agente_conversas WHERE id IN ($1,$3)`,[c9,seller,c8]);
    await db.query("UPDATE empresa_membros SET ativo=false WHERE empresa_id=$1 AND user_id=$2",[emp,seller]);

    const leadRecusado=()=>db.query(`SELECT l.etapa,l.qualificacao,l.motivo_perda_codigo FROM mimo_leads l
      JOIN mimo_agente_conversas c ON c.lead_id=l.id WHERE c.id=$1`,[c9]);
    expect(await worker('autorizar',{...t9,resultado:{...resultado,resposta:'Outro texto'}})).toBe(false);
    expect((await leadRecusado()).rows[0]).toMatchObject({etapa:'novo',qualificacao:'pendente'});
    await db.exec('SET ROLE authenticated');
    await expect(worker('autorizar',{...t9,resultado})).rejects.toThrow(/permission denied/);
    await db.exec(`RESET ROLE;
      CREATE FUNCTION teste_falha_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'falha_auditoria_sintetica'; END $$;
      CREATE TRIGGER teste_falha_auditoria BEFORE INSERT ON mimo_lead_followup_historico
      FOR EACH ROW EXECUTE FUNCTION teste_falha_auditoria();
      SET ROLE service_role;`);
    await expect(worker('autorizar',{...t9,resultado})).rejects.toThrow('falha_auditoria_sintetica');
    await db.exec('RESET ROLE; DROP TRIGGER teste_falha_auditoria ON mimo_lead_followup_historico');
    expect((await leadRecusado()).rows[0]).toMatchObject({etapa:'novo',qualificacao:'pendente'});
    expect((await db.query("SELECT estado FROM mimo_agente_fila WHERE id=$1",[t9.id])).rows).toEqual([{estado:'reservada'}]);
    expect((await db.query("SELECT estado FROM mimo_follow_aviso_fila ORDER BY estado")).rows).toEqual([
      {estado:'bloqueada'},{estado:'bloqueada'},
    ]);
    await db.exec('RESET ROLE; SET ROLE service_role');
    expect(await worker('autorizar',{...t9,resultado})).toBe(true);
    expect(await worker('autorizar',{...t9,resultado})).toBe(false);
    await db.exec('RESET ROLE');
    expect((await leadRecusado()).rows[0]).toEqual({etapa:'perdido',qualificacao:'nao_qualificado',motivo_perda_codigo:'falta_interesse'});
    expect((await db.query("SELECT estado,followup_bloqueado,motivo FROM mimo_agente_conversas WHERE id=$1",[c9])).rows).toEqual([
      {estado:'pausada',followup_bloqueado:true,motivo:'falta_interesse'},
    ]);
    expect((await db.query("SELECT estado FROM mimo_agente_fila WHERE conversa_id=$1 AND sequencia=99",[c9])).rows).toEqual([{estado:'cancelada'}]);
    expect((await db.query(`SELECT f.estado,f.versao,q.estado AS aviso FROM mimo_lead_followups f
      JOIN mimo_follow_aviso_fila q ON q.follow_id=f.id JOIN mimo_agente_conversas c ON c.lead_id=f.lead_id
      WHERE c.id=$1`,[c9])).rows).toEqual([{estado:'cancelado',versao:2,aviso:'cancelada'}]);
    expect((await db.query(`SELECT f.estado FROM mimo_lead_followups f
      JOIN mimo_agente_conversas c ON c.lead_id=f.lead_id WHERE c.id=$1`,[c8])).rows).toEqual([{estado:'pendente'}]);
    expect((await db.query(`SELECT h.requisicao->>'motivo' AS motivo FROM mimo_lead_followup_historico h
      JOIN mimo_agente_conversas c ON c.lead_id=h.lead_id WHERE c.id=$1`,[c9])).rows).toEqual([{motivo:'falta_interesse'}]);
    expect((await db.query(`SELECT count(*)::int AS n FROM mimo_lead_historico h JOIN mimo_agente_conversas c ON c.lead_id=h.lead_id
      WHERE c.id=$1 AND h.atual->>'motivo_perda_codigo'='falta_interesse'`,[c9])).rows).toEqual([{n:1}]);
    expect(await worker('incerta',t9)).toBe(true);
    expect((await leadRecusado()).rows[0]).toMatchObject({etapa:'perdido'});

    // Confirmed influence partnership on a resale-ad lead: official influencer form + commercial disqualification.
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-parceria-influencia.sql"));
    const c11=await seed(11);
    const mkt="Sou influenciadora e quero fazer parceria com vocês";
    const parceria=parceriaInfluenciaAgente([{role:"user",content:"Olá bom dia"},{role:"user",content:mkt}],{});
    expect(parceria?.motivo).toBe("parceria_influencia");
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'mkt','recebida',$2)",[c11,mkt]);
    await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'");
    await db.exec('SET ROLE service_role');
    const t11=await worker('reservar');
    expect(t11).toMatchObject({conversa:c11,encerramentoRevenda:true,parceriaInfluencia:true,followup:false});
    await db.exec('RESET ROLE');
    await db.query(`INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,estado,executar_em,motivo)
      VALUES($1,$2,98,1,'pendente',teste_agora()+interval '2 hours','followup_2h')`,[emp,c11]);
    await db.exec('SET ROLE service_role');
    expect(await worker('autorizar',{...t11,resultado:{...parceria,resposta:'https://exemplo.invalido/form'}})).toBe(false);
    expect(await worker('autorizar',{...t11,resultado:parceria})).toBe(true);
    await db.exec('RESET ROLE');
    expect((await db.query(`SELECT l.etapa,l.qualificacao,l.motivo_perda_codigo FROM mimo_leads l
      JOIN mimo_agente_conversas c ON c.lead_id=l.id WHERE c.id=$1`,[c11])).rows[0]).toEqual({etapa:'perdido',qualificacao:'nao_qualificado',motivo_perda_codigo:'sem_perfil'});
    expect((await db.query("SELECT estado,followup_bloqueado,motivo FROM mimo_agente_conversas WHERE id=$1",[c11])).rows).toEqual([
      {estado:'pausada',followup_bloqueado:true,motivo:'parceria_influencia'}]);
    expect((await db.query("SELECT estado,motivo FROM mimo_agente_fila WHERE conversa_id=$1 AND sequencia=98",[c11])).rows).toEqual([{estado:'cancelada',motivo:'parceria_influencia'}]);
    expect((await db.query("SELECT count(*)::int n FROM mimo_agente_historico WHERE conversa_id=$1 AND acao='parceria_influencia'",[c11])).rows).toEqual([{n:1}]);

    // Legacy disqualified lead: a pending follow-up is cancelled and blocked persistently at reservation.
    await db.exec(sql("drizzle/migrations/0061_mimo_agente_representacao.sql"));
    const representante = await seed(15);
    const textoRepresentacao = "Quero representar vocês";
    const resultadoRepresentacao = representacaoAgente([{ role: "user", content: textoRepresentacao }], {});
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'representar','recebida',$2)", [representante, textoRepresentacao]);
    await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'; SET ROLE service_role");
    const tarefaRepresentacao = await worker("reservar");
    expect(tarefaRepresentacao).toMatchObject({ conversa: representante, representacao: true });
    await db.exec("RESET ROLE");
    await db.query(`INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,estado,executar_em,motivo)
      VALUES($1,$2,95,1,'pendente',teste_agora()+interval '2 hours','followup_2h')`, [emp, representante]);
    await db.exec("SET ROLE service_role");
    expect(await worker("autorizar", { ...tarefaRepresentacao, resultado: { ...resultadoRepresentacao, resposta: "Link diferente" } })).toBe(false);
    expect(await worker("autorizar", { ...tarefaRepresentacao, resultado: resultadoRepresentacao })).toBe(true);
    await db.exec("RESET ROLE");
    expect((await db.query(`SELECT l.qualificacao,l.motivo_perda_codigo,c.followup_bloqueado,f.estado
      FROM mimo_agente_conversas c JOIN mimo_leads l ON l.id=c.lead_id JOIN mimo_agente_fila f ON f.conversa_id=c.id
      WHERE c.id=$1 AND f.sequencia=95`, [representante])).rows)
      .toEqual([{ qualificacao: "nao_qualificado", motivo_perda_codigo: "sem_perfil", followup_bloqueado: true, estado: "cancelada" }]);

    // The lead writes again after the form: thanks keep the pause, real content resumes the agent.
    await db.exec("SET ROLE service_role");
    await worker("enviada", { ...tarefaRepresentacao, messageId: "form-representante" });
    await db.exec("RESET ROLE");
    const retomada = sql("docs/migracoes-preparadas/mimo-agente-retomada-apos-formulario.sql");
    await db.exec(retomada);
    await db.exec(retomada);
    const estadoRetomada = async (conversa: string) => (await db.query(`SELECT c.estado,c.motivo,c.followup_bloqueado,
      l.etapa,l.qualificacao,l.motivo_perda_codigo,
      (SELECT count(*)::int FROM mimo_agente_fila f WHERE f.conversa_id=c.id AND f.estado='pendente' AND f.motivo='') AS pendentes
      FROM mimo_agente_conversas c JOIN mimo_leads l ON l.id=c.lead_id WHERE c.id=$1`, [conversa])).rows[0];
    for (const agradecimento of ["Obrigado!", "ok, obrigada 🙏", "👍", "Valeu, beleza"]) {
      await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),$2,'recebida',$3)", [representante, `ack-${agradecimento}`, agradecimento]);
      expect(await estadoRetomada(representante)).toMatchObject({ estado: "pausada", motivo: "representacao", pendentes: 0 });
    }
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'anuncio-distribuidor','recebida',$2)",
      [representante, "Olá! Posso ter mais informações sobre isso?"]);
    expect(await estadoRetomada(representante)).toEqual({
      estado: "agente", motivo: "retomada_lead", followup_bloqueado: true,
      etapa: "contato_realizado", qualificacao: "pendente", motivo_perda_codigo: null, pendentes: 1,
    });
    expect((await db.query("SELECT dados->>'motivoAnterior' AS m FROM mimo_agente_historico WHERE conversa_id=$1 AND acao='retomada_lead'",
      [representante])).rows).toEqual([{ m: "representacao" }]);
    await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'; SET ROLE service_role");
    expect(await worker("reservar")).toMatchObject({ conversa: representante, followup: false });
    await db.exec("RESET ROLE");
    // A refusal (falta_interesse) is not reopened by a later message.
    const recusada = await seed(16);
    await db.query("UPDATE mimo_agente_conversas SET estado='pausada',motivo='falta_interesse' WHERE id=$1", [recusada]);
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'apos-recusa','recebida','Quero saber mais')", [recusada]);
    expect(await estadoRetomada(recusada)).toMatchObject({ estado: "pausada", motivo: "falta_interesse", pendentes: 0 });

    // Marketing swaps the agent catalog PDF; only one stays active and it bypasses the version list.
    const catalogoMarketing = sql("docs/migracoes-preparadas/mimo-agente-catalogo-marketing.sql");
    await db.exec(catalogoMarketing);
    await db.exec(catalogoMarketing);
    expect((await db.query("SELECT file_size_limit::int AS l FROM storage.buckets WHERE id='mimo-agente-materiais'")).rows)
      .toEqual([{ l: 52428800 }]);
    expect((await db.query(`SELECT position($$m.tipo='catalogo'$$ IN pg_get_functiondef('mimo_agente_worker(text,jsonb)'::regprocedure))>0 AS w,
      position($$mm.tipo='catalogo'$$ IN pg_get_functiondef('mimo_agente_operar(uuid,uuid,text,jsonb)'::regprocedure))>0 AS o`)).rows)
      .toEqual([{ w: true, o: true }]);
    const marketingCat = crypto.randomUUID();
    await db.query("INSERT INTO empresa_membros VALUES($1,$2,'marketing',true)", [emp, marketingCat]);
    const trocarCatalogo = async (ator: string, id: string, path = `${emp}/${id}.pdf`) => {
      await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('mimo-agente-materiais',$1)", [path]);
      return db.query("SELECT mimo_agente_catalogo_trocar($1,$2,$3,' Catálogo MiMo ',$4)", [emp, ator, id, path]);
    };
    const cat1 = crypto.randomUUID(), cat2 = crypto.randomUUID();
    await trocarCatalogo(marketingCat, cat1);
    await trocarCatalogo(admin, cat2);
    await expect(trocarCatalogo(seller, crypto.randomUUID())).rejects.toThrow("Sem permissão");
    await expect(trocarCatalogo(marketingCat, crypto.randomUUID(), `${emp}/outro.pdf`)).rejects.toThrow("Arquivo privado inválido");
    expect((await db.query("SELECT id::text,nome,ativo FROM mimo_agente_materiais WHERE tipo='catalogo' AND id=ANY($1::uuid[]) ORDER BY ativo",
      [[cat1, cat2]])).rows).toEqual([
      { id: cat1, nome: "Catálogo MiMo", ativo: false },
      { id: cat2, nome: "Catálogo MiMo", ativo: true },
    ]);
    await db.exec("SET ROLE authenticated");
    await expect(db.query("SELECT mimo_agente_catalogo_trocar($1,$2,$3,'x',$4)", [emp, marketingCat, crypto.randomUUID(), "x"]))
      .rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");

    const c12=await seed(12);
    await db.query(`UPDATE mimo_leads SET etapa='perdido',qualificacao='nao_qualificado',motivo_perda_codigo='sem_perfil'
      WHERE id=(SELECT lead_id FROM mimo_agente_conversas WHERE id=$1)`,[c12]);
    await db.query(`INSERT INTO mimo_agente_fila(empresa_id,conversa_id,sequencia,versao,estado,executar_em,motivo)
      VALUES($1,$2,96,1,'pendente',teste_agora()-interval '1 minute','followup_2h'),
            ($1,$2,97,1,'pendente',teste_agora()+interval '1 hour','retomada_historica')`,[emp,c12]);
    await db.exec('SET ROLE service_role');
    expect(await worker('reservar')).toBeNull();
    await db.exec('RESET ROLE');
    expect((await db.query("SELECT followup_bloqueado FROM mimo_agente_conversas WHERE id=$1",[c12])).rows).toEqual([{followup_bloqueado:true}]);
    expect((await db.query("SELECT estado FROM mimo_agente_fila WHERE conversa_id=$1 AND sequencia IN (96,97)",[c12])).rows
      .every((r:any)=>r.estado==='cancelada')).toBe(true);
    expect((await db.query("SELECT motivo FROM mimo_agente_fila WHERE conversa_id=$1 AND sequencia=97",[c12])).rows).toEqual([{motivo:'lead_desqualificado'}]);

    const c10=await seed(10);
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'optout','recebida','Desisto da revenda. Não me envie mais mensagens.')",[c10]);
    expect((await db.query("SELECT estado,motivo FROM mimo_agente_conversas WHERE id=$1",[c10])).rows).toEqual([
      {estado:'bloqueada',motivo:'parar'},
    ]);
    await db.exec("SET ROLE authenticated");
    await expect(audio(t8)).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT mimo_agente_followup_agendar()")).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT * FROM mimo_agente_followup_envios")).rejects.toThrow(/permission denied/);
    // A lead message during an in-flight reply waits for it instead of handing the lead over.
    await db.exec("RESET ROLE");
    await db.exec(sql("drizzle/migrations/0068_mimo_agente_envio_em_transito.sql"));
    const estadoConversa = async (conversa: string) =>
      (await db.query("SELECT estado,motivo FROM mimo_agente_conversas WHERE id=$1", [conversa])).rows[0];
    const filaConversa = async (conversa: string) => (await db.query(
      "SELECT estado FROM mimo_agente_fila WHERE conversa_id=$1 AND sequencia>1 ORDER BY sequencia", [conversa])).rows.map((r: any) => r.estado);
    const emEnvio = async (conversa: string, resultado: object) => {
      // Isolate the scenario from turns left pending by the earlier ones.
      await db.query("UPDATE mimo_agente_fila SET estado='cancelada' WHERE estado IN ('pendente','reservada') AND conversa_id<>$1", [conversa]);
      await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),$2,'recebida','Quero revender')", [conversa, "pedido-" + conversa]);
      await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'; SET ROLE service_role");
      const tarefa = await worker("reservar");
      expect(tarefa).toMatchObject({ conversa });
      expect(await worker("autorizar", { ...tarefa, resultado })).toBe(true);
      await db.exec("RESET ROLE");
      // The lead sends the next part of the message while the reply is still being sent.
      await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),$2,'recebida','Valor')", [conversa, "durante-" + conversa]);
      await db.exec("UPDATE teste_relogio SET t=t+interval '21 seconds'");
      return tarefa;
    };
    const pergunta = { resposta: "Em qual estado você pretende revender?", dados: {}, estado: "agente", encaminhar: false, motivo: "" };
    const transito = await seed(20);
    const emAndamento = await emEnvio(transito, pergunta);
    expect(await estadoConversa(transito)).toEqual({ estado: "agente", motivo: "" });
    expect(await filaConversa(transito)).toEqual(["enviando", "pendente"]);
    await db.exec("SET ROLE service_role");
    expect(await worker("reservar")).toBeNull();
    expect(await worker("enviada", { ...emAndamento, messageId: "resposta-transito" })).toBe(true);
    expect(await worker("reservar")).toMatchObject({ conversa: transito });
    await db.exec("RESET ROLE");

    // A handoff sent during that window still applies and the queued turn is dropped.
    const encaminhada = await seed(21);
    const handoff = await emEnvio(encaminhada, { ...pergunta, resposta: "Vou encaminhar sua conversa à equipe da MiMo.",
      estado: "humano", encaminhar: true, motivo: "pre_qualificacao_pendente_revisao" });
    await db.exec("SET ROLE service_role");
    expect(await worker("enviada", { ...handoff, messageId: "resposta-encaminhada" })).toBe(true);
    expect(await worker("reservar")).toBeNull();
    await db.exec("RESET ROLE");
    expect(await estadoConversa(encaminhada)).toEqual({ estado: "humano", motivo: "pre_qualificacao_pendente_revisao" });
    expect(await filaConversa(encaminhada)).toEqual(["enviada", "cancelada"]);

    // An uncertain send keeps the duplicate protection: the team takes over, nothing is resent.
    const incerta = await seed(22);
    const duvidosa = await emEnvio(incerta, pergunta);
    await db.exec("SET ROLE service_role");
    expect(await worker("incerta", { ...duvidosa, motivo: "envio_Error" })).toBe(true);
    expect(await worker("reservar")).toBeNull();
    await db.exec("RESET ROLE");
    expect(await estadoConversa(incerta)).toEqual({ estado: "humano", motivo: "aceite_incerto" });
    expect(await filaConversa(incerta)).toEqual(["incerta", "cancelada"]);
    await db.query("UPDATE mimo_agente_conversas SET estado='agente',motivo='' WHERE id=$1", [incerta]);
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'apos-incerta','recebida','Oi?')", [incerta]);
    expect(await estadoConversa(incerta)).toEqual({ estado: "humano", motivo: "envio_em_transito" });

    // Menu reply: the agent's own menu (first message id recorded; the extra-options echo is dropped
    // by the webhook) is not a manual send, and the lead's choice is queued for the agent.
    const menu = await seed(24);
    const envioMenu = await emEnvio(menu, { ...pergunta, resposta: "O que melhor descreve você?" });
    await db.exec("SET ROLE service_role");
    expect(await worker("enviada", { ...envioMenu, messageId: "menu-24" })).toBe(true);
    await db.exec("RESET ROLE");
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'menu-24','enviada','O que melhor descreve você?')", [menu]);
    await db.query("SELECT mimo_agente_enfileirar($1,gen_random_uuid(),'escolha-24','recebida','Quero revender')", [menu]);
    expect(await estadoConversa(menu)).toEqual({ estado: "agente", motivo: "" });
    expect((await filaConversa(menu)).at(-1)).toBe("pendente");

    // A send interrupted for good also stays with the team.
    const interrompida = await seed(23);
    await emEnvio(interrompida, pergunta);
    await db.exec("UPDATE teste_relogio SET t=t+interval '3 minutes'; SET ROLE service_role");
    await worker("reservar");
    await db.exec("RESET ROLE");
    expect(await estadoConversa(interrompida)).toEqual({ estado: "humano", motivo: "processamento_interrompido" });
    expect((await filaConversa(interrompida))[0]).toBe("incerta");
  } finally {await db.close();}
},30000);

