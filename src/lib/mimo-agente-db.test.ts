import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { configInicialAgente } from "./mimo-agente";
const emp = "10000000-0000-4000-8000-000000000001",
  admin = "20000000-0000-4000-8000-000000000001",
  seller = "20000000-0000-4000-8000-000000000002",
  other = "20000000-0000-4000-8000-000000000003",
  binding = "30000000-0000-4000-8000-000000000001";
it("SQL real: publicação, piloto isolado, fila atômica, RLS, interrupção e qualificação humana", async () => {
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
    const op = async (acao: string, p: Record<string, unknown> = {}, ator = admin) =>
      (
        await db.query<{ r: any }>("SELECT mimo_agente_operar($1,$2,$3,$4::jsonb) AS r", [
          emp,
          ator,
          acao,
          JSON.stringify({ publicada: 1, ...p }),
        ])
      ).rows[0].r;
    const worker = async (acao: string, p: unknown = {}) =>
      (
        await db.query<{ r: any }>("SELECT mimo_agente_worker($1,$2::jsonb) AS r", [
          acao,
          JSON.stringify(p),
        ])
      ).rows[0].r;
    const advance = async (n = 6) => {
      await db.query("UPDATE teste_relogio SET t=t+make_interval(secs=>$1)", [n]);
    };
    const receive = async (id: string, phone: string, text = "Olá", from = false) =>
      (
        await db.query<{ id: string | null }>(
          "SELECT mimo_receber_whatsapp($1,$2,repeat('a',64),$3,$4,'Contato sintético',$5,teste_agora(),$6) AS id",
          [binding, admin, id, phone, text, from],
        )
      ).rows[0].id;
    await db.exec("SET ROLE service_role");
    await op("painel");
    expect((await op("painel")).config.modo).toBe("desativado");
    const oldLead = await receive("old", "5511999990001");
    expect(await worker("reservar")).toBeNull();
    await expect(op("salvar", { revisao: 1, config: {} }, seller)).rejects.toThrow(
      "Somente gestão",
    );
    const materialId = "50000000-0000-4000-8000-000000000001";
    await db.exec("RESET ROLE");
    await db.query("INSERT INTO storage.objects VALUES('mimo-agente-materiais',$1)", [
      `${emp}/${materialId}.pdf`,
    ]);
    await db.exec("SET ROLE service_role");
    await expect(
      db.query("SELECT mimo_agente_material($1,$2,$3,'Catálogo','catalogo',$4,'application/pdf')", [
        emp,
        seller,
        materialId,
        `${emp}/${materialId}.pdf`,
      ]),
    ).rejects.toThrow("Somente gestão");
    await db.query(
      "SELECT mimo_agente_material($1,$2,$3,'Catálogo','catalogo',$4,'application/pdf')",
      [emp, admin, materialId, `${emp}/${materialId}.pdf`],
    );
    const cfg = {
      ...configInicialAgente,
      conhecimento: "Informação aprovada sintética.",
      conhecimentoRevisado: true,
      encaminhamentoRevisado: true,
      horarios: [{ dia: 1, inicio: "09:00", fim: "18:00" }],
      pilotos: ["5511999990002"],
      materiais: [materialId],
    };
    await op("salvar", { revisao: 1, config: cfg });
    await expect(op("salvar", { revisao: 1, config: cfg })).rejects.toThrow(
      "Configuração alterada",
    );
    await expect(op("publicar", { revisao: 2 })).rejects.toThrow("Revise");
    await op("simulacao", { revisao: 2 });
    await op("publicar", { revisao: 2 });
    await expect(op("ativar", { revisao: 2, modo: "ativo", vinculo: binding })).rejects.toThrow(
      "Valide um envio interno",
    );
    await op("ativar", { revisao: 2, modo: "piloto", vinculo: binding });
    await advance();
    expect(await receive("pilot", "5511999990002")).toBeNull();
    expect(await receive("pilot", "5511999990002")).toBeNull();
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT count(*)::int AS n FROM mimo_leads")).rows).toEqual([{ n: 1 }]);
    expect((await db.query("SELECT count(*)::int AS n FROM mimo_agente_fila")).rows).toEqual([
      { n: 1 },
    ]);
    await advance();
    await db.exec("SET ROLE service_role");
    const pilot = await worker("reservar");
    expect(pilot.materiais[0].id).toBe(materialId);
    expect(pilot.mensagens).toEqual([{ role: "user", content: "Olá" }]);
    expect(await worker("reservar")).toBeNull();
    expect(
      await worker("autorizar", {
        ...pilot,
        resultado: {
          resposta: "Olá, sou o assistente virtual da MiMo.",
          dados: {},
          estado: "agente",
          resumo: "Coleta incompleta.",
          motivo: "",
        },
      }),
    ).toBe(true);
    await receive("echo", "5511999990002", "Olá, sou o assistente virtual da MiMo.", true);
    await worker("enviada", { ...pilot, messageId: "echo" });
    expect((await op("painel")).conversas[0].estado).toBe("agente");
    await op("ativar", { revisao: 2, modo: "ativo", vinculo: binding });
    await advance();
    await receive("old-reply", "5511999990001");
    expect((await op("painel")).conversas).toHaveLength(1);
    const lead = await receive("new", "5511999990003", "Tenho um empório");
    await advance(2);
    await receive("new2", "5511999990003", "em Porto Alegre");
    await advance(4);
    expect(await worker("reservar")).toBeNull();
    await advance(2);
    const first = await worker("reservar");
    expect(first.mensagens.map((x: { content: string }) => x.content).join(" ")).toBe(
      "Tenho um empório em Porto Alegre",
    );
    const c = (await op("painel")).conversas.find((x: { lead_id: string }) => x.lead_id === lead);
    await expect(op("assumir", { conversa: c.id }, seller)).rejects.toThrow(
      "Conversa não autorizada",
    );
    await db.exec("RESET ROLE");
    await db.query("UPDATE mimo_leads SET responsavel_id=$1 WHERE id=$2", [seller, lead]);
    await db.exec("SET ROLE service_role");
    expect((await op("painel", {}, seller)).conversas).toHaveLength(1);
    expect((await op("painel", {}, other)).conversas).toHaveLength(0);
    await op("assumir", { conversa: c.id }, seller);
    expect(await worker("validar", first)).toBe(false);
    expect(
      await worker("autorizar", { ...first, resultado: { resposta: "Não deve enviar" } }),
    ).toBe(false);
    await op("devolver", { conversa: c.id }, seller);
    await receive("correction", "5511999990003", "Meu nome é Maria");
    await advance();
    const second = await worker("reservar");
    await receive("more", "5511999990003", "Sou responsável pelas compras");
    expect(await worker("validar", second)).toBe(false);
    await advance();
    const third = await worker("reservar");
    await db.query("SELECT mimo_agente_material($1,$2,$3)", [emp, admin, materialId]);
    expect(
      await worker("autorizar", {
        ...third,
        resultado: { resposta: "Arquivo", estado: "agente", materialId },
      }),
    ).toBe(false);
    expect(
      await worker("autorizar", {
        ...third,
        resultado: {
          resposta: "Olá Maria",
          dados: { nome: { valor: "Maria", evidencia: "Meu nome é Maria" } },
          estado: "humano",
          motivo: "pre_qualificacao_pendente_revisao",
          resumo: "Pré-qualificação pendente de revisão.",
        },
      }),
    ).toBe(true);
    await worker("incerta", third);
    expect(await worker("reservar")).toBeNull();
    await expect(op("devolver", { conversa: c.id }, seller)).rejects.toThrow("incerto");
    await db.exec("RESET ROLE");
    expect(
      (
        await db.query(
          "SELECT qualificacao,etapa,valor_pedido,conversao_em FROM mimo_leads WHERE id=$1",
          [lead],
        )
      ).rows,
    ).toEqual([
      { qualificacao: "pendente", etapa: "novo", valor_pedido: null, conversao_em: null },
    ]);
    await db.exec("SET ROLE service_role");
    await receive("stop", "5511999990003", "Não quero mais mensagens");
    expect((await op("painel")).conversas.find((x: { id: string }) => x.id === c.id).estado).toBe(
      "bloqueada",
    );
    await expect(op("devolver", { conversa: c.id }, seller)).rejects.toThrow("pediu para parar");
    await expect(op("assumir", { conversa: c.id }, seller)).rejects.toThrow("pediu para parar");
    // A human-originated first contact cannot be taken over when the person replies.
    await receive("manual-first", "5511999990008", "Olá", true);
    await receive("manual-reply", "5511999990008", "Olá de volta");
    expect(
      (await op("painel")).conversas.some(
        (x: { telefone: string }) => x.telefone === "5511999990008",
      ),
    ).toBe(false);
    // Explicit manual sends share durable idempotency and final authorization.
    await receive("manual-candidate", "5511999990005");
    const mc = (await op("painel")).conversas.find(
      (x: { telefone: string }) => x.telefone === "5511999990005",
    );
    const request = {
      conversa: mc.id,
      texto: "Olá, a equipe está aqui.",
      solicitacao: "40000000-0000-4000-8000-000000000001",
    };
    const mf = await op("responder_reservar", request);
    expect(await op("responder_reservar", request)).toEqual({ duplicada: true });
    expect(await op("responder_autorizar", { ...mf, conversa: mc.id })).toBe(true);
    await worker("enviada", { ...mf, messageId: "human-sent" });
    expect((await op("painel")).conversas.find((x: { id: string }) => x.id === mc.id).estado).toBe(
      "humano",
    );
    expect(await op("responder_reservar", request)).toEqual({ duplicada: true });
    await advance();
    await receive("interrupted", "5511999990006");
    await advance();
    const interrupted = await worker("reservar");
    expect(
      await worker("autorizar", {
        ...interrupted,
        resultado: {
          resposta: "Teste de interrupção",
          dados: {},
          resumo: "Coleta incompleta.",
          estado: "agente",
          motivo: "",
        },
      }),
    ).toBe(true);
    await advance(181);
    expect(await worker("reservar")).toBeNull();
    const afterCrash = (await op("painel")).conversas.find(
      (x: { telefone: string }) => x.telefone === "5511999990006",
    );
    expect(afterCrash.estado).toBe("humano");
    expect(afterCrash.fila[0].estado).toBe("incerta");
    await expect(op("devolver", { conversa: afterCrash.id })).rejects.toThrow("incerto");
    // Company IDs and actors are independently checked, even through the service RPC.
    await db.exec("RESET ROLE");
    await db.exec(
      `INSERT INTO empresas VALUES('10000000-0000-4000-8000-000000000099','outra',true)`,
    );
    await db.exec("SET ROLE service_role");
    await expect(
      db.query("SELECT mimo_agente_operar('10000000-0000-4000-8000-000000000099',$1,'painel')", [
        admin,
      ]),
    ).rejects.toThrow("Empresa inválida");
    await op("pausar_geral", { revisao: 2 });
    await advance();
    await receive("off", "5511999990004");
    expect(await worker("reservar")).toBeNull();
    await db.exec("RESET ROLE;SET ROLE authenticated");
    await db.query("SELECT set_config('app.uid',$1,false)", [other]);
    expect((await db.query("SELECT * FROM mimo_agente_conversas")).rows).toHaveLength(0);
    await db.query("SELECT set_config('app.uid',$1,false)", [seller]);
    expect((await db.query("SELECT * FROM mimo_agente_conversas")).rows).toHaveLength(1);
    await expect(db.query("SELECT mimo_agente_worker('reservar')")).rejects.toThrow();
    await expect(
      db.query("SELECT mimo_agente_operar($1,$2,'ativar')", [emp, admin]),
    ).rejects.toThrow();
    await expect(db.exec("UPDATE mimo_agente_config SET modo='ativo'")).rejects.toThrow();
    await expect(db.exec("DELETE FROM mimo_agente_versoes")).rejects.toThrow();
    // Forward migration removes previously granted seller access, including owned leads.
    await db.exec("RESET ROLE");
    await db.exec(sql("docs/migracoes-preparadas/mimo-agente-acesso-gestao.sql"));
    await db.exec("SET ROLE authenticated");
    await db.query("SELECT set_config('app.uid',$1,false)", [seller]);
    expect((await db.query("SELECT * FROM mimo_agente_conversas")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM mimo_agente_fila")).rows).toHaveLength(0);
    await db.exec("RESET ROLE;SET ROLE service_role");
    for (const acao of ["painel", "salvar", "publicar", "ativar", "pausar_geral", "assumir", "pausar", "devolver", "revisar", "responder_reservar", "responder_autorizar"]) {
      await expect(op(acao, { conversa: c.id }, seller)).rejects.toThrow("Acesso negado");
    }
    expect((await op("painel")).gestor).toBe(true);
    await db.exec(`RESET ROLE;UPDATE empresa_membros SET papel='gestor' WHERE user_id='${admin}';SET ROLE service_role`);
    expect((await op("painel")).gestor).toBe(true);
    expect(oldLead).toBeTruthy();
  } catch (error) {
    console.error((error as { where?: string }).where);
    throw error;
  } finally {
    await db.close();
  }
}, 30000);
