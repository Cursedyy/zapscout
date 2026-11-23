import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const empresa = "10000000-0000-4000-8000-000000000001";
const admin = "20000000-0000-4000-8000-000000000001";
const vendedor = "20000000-0000-4000-8000-000000000002";
const marketing = "20000000-0000-4000-8000-000000000003";
const linhaEntrada = "30000000-0000-4000-8000-000000000001";
const linhaFechamento = "30000000-0000-4000-8000-000000000002";
const lead = "40000000-0000-4000-8000-000000000001";
const semHistorico = "40000000-0000-4000-8000-000000000002";

it("reserva o envio comercial com a linha do lead, verifica permissões e registra o aceite sem duplicar", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
      CREATE TYPE empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
      CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
      CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
      CREATE FUNCTION empresa_papel_de(e uuid,u uuid) RETURNS empresa_papel LANGUAGE sql AS $$
        SELECT papel FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo$$;
      CREATE FUNCTION tem_papel_empresa(e uuid,u uuid,p empresa_papel[]) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p))$$;
      CREATE FUNCTION is_membro_empresa(e uuid,u uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo)$$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(bucket_id text,name text);
      INSERT INTO empresas VALUES('${empresa}','mimo',true);
      INSERT INTO empresa_membros VALUES ('${empresa}','${admin}','administrador',true),
        ('${empresa}','${vendedor}','vendedor',true), ('${empresa}','${marketing}','marketing',true);`);
    for (const file of [
      "drizzle/migrations/0008_mimo_leads_comerciais.sql",
      "drizzle/migrations/0009_mimo_whatsapp_recebimento.sql",
      "drizzle/migrations/0031_mimo_agente.sql",
      "drizzle/migrations/0038_mimo_agente_acesso_gestao.sql",
    ]) await db.exec(readFileSync(file, "utf8"));
    await db.exec(`ALTER TABLE mimo_whatsapp_vinculos ADD COLUMN finalidade text;
      CREATE FUNCTION mimo_comercial_telefone_interno(_empresa uuid,_numero text) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS(SELECT 1 FROM public.mimo_whatsapp_vinculos WHERE empresa_id=_empresa AND ativo AND numero_comercial=_numero)$$;
      INSERT INTO mimo_whatsapp_vinculos(id,empresa_id,owner_id,numero_comercial,token_sha256,ativo,confirmado_por,finalidade) VALUES
        ('${linhaEntrada}','${empresa}','${admin}','5511888880001',repeat('a',64),true,'${admin}','entrada'),
        ('${linhaFechamento}','${empresa}','${admin}','5511888880002',repeat('b',64),true,'${admin}','fechamento');
      INSERT INTO mimo_leads(id,empresa_id,nome_empresa,telefone,created_by) VALUES
        ('${lead}','${empresa}','Lead existente','5511999990001','${admin}'),
        ('${semHistorico}','${empresa}','Lead novo','5511999990002','${admin}');
      INSERT INTO mimo_whatsapp_eventos(empresa_id,vinculo_id,message_id,lead_id,direcao,texto,contato_em)
        VALUES ('${empresa}','${linhaFechamento}','inicial','${lead}','recebida','Quero conhecer os produtos',clock_timestamp());`);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-conversa-comercial.sql", "utf8"));
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-catalogo-chat.sql", "utf8"));
    const pdf = "50000000-0000-4000-8000-000000000001";
    const rascunho = "50000000-0000-4000-8000-000000000002";
    await db.exec(`INSERT INTO mimo_agente_config(empresa_id,publicada,atualizado_por) VALUES('${empresa}',1,'${admin}');
      INSERT INTO mimo_agente_versoes(empresa_id,versao,config,ator_id) VALUES
        ('${empresa}',1,'{"materiais":["${pdf}"]}','${admin}'),
        ('${empresa}',2,'{"materiais":["${rascunho}"]}','${admin}');
      INSERT INTO mimo_agente_materiais(id,empresa_id,nome,tipo,path,mime,ator_id) VALUES
        ('${pdf}','${empresa}','Publicado','catalogo','${empresa}/${pdf}.pdf','application/pdf','${admin}'),
        ('${rascunho}','${empresa}','Rascunho','catalogo','${empresa}/${rascunho}.pdf','application/pdf','${admin}');`);
    const catalogo = async (ator = vendedor, leadId = lead) => (await db.query<{ path: string | null }>(
      "SELECT mimo_catalogo_chat($1,$2,$3) AS path", [empresa, ator, leadId],
    )).rows[0].path;
    const op = async (acao: string, dados: object, ator = vendedor, leadId = lead) => (
      await db.query<{ resultado: boolean | { estado: string; id?: string; reserva?: string; vinculo?: string } }>(
        "SELECT mimo_conversa_comercial($1,$2,$3,$4,$5::jsonb) AS resultado",
        [empresa, ator, leadId, acao, JSON.stringify(dados)],
      )
    ).rows[0].resultado;

    const mensagem = { texto: "Olá!", solicitacao: crypto.randomUUID() };
    await db.exec("SET ROLE authenticated");
    await expect(op("reservar", mensagem)).rejects.toThrow("permission denied");
    await expect(catalogo()).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE; SET ROLE service_role");
    expect(await catalogo()).toBe(`${empresa}/${pdf}.pdf`);
    expect(await catalogo(marketing)).toBeNull();
    expect(await catalogo(vendedor, crypto.randomUUID())).toBeNull();
    await expect(op("reservar", mensagem, marketing)).rejects.toThrow("Conversa indisponível");
    const reserva = await op("reservar", mensagem);
    expect(reserva).toMatchObject({ estado: "reservada", vinculo: linhaFechamento, telefone: "5511999990001" });
    expect(await op("reservar", mensagem)).toEqual({ estado: "em_andamento" });
    expect(await op("reservar", { ...mensagem, solicitacao: crypto.randomUUID() })).toEqual({ estado: "em_andamento" });
    const envio = typeof reserva === "object" ? { id: reserva.id, reserva: reserva.reserva } : {};
    expect(await op("autorizar", { ...envio, tokenHash: "a".repeat(64) })).toBe(false);
    expect(await op("autorizar", { ...envio, tokenHash: "b".repeat(64) })).toBe(true);
    expect(await op("autorizar", { ...envio, tokenHash: "b".repeat(64) })).toBe(false);
    expect(await op("reservar", mensagem)).toEqual({ estado: "incerta" });
    const confirma = await db.query<{ resultado: boolean }>("SELECT mimo_agente_worker('enviada',$1::jsonb) AS resultado", [JSON.stringify({ ...envio, messageId: "aceite-1" })]);
    expect(confirma.rows[0].resultado).toBe(true);
    expect(await op("reservar", mensagem)).toEqual({ estado: "enviada" });
    expect(await op("reservar", { texto: "Primeiro contato", solicitacao: crypto.randomUUID() }, vendedor, semHistorico)).toMatchObject({ estado: "reservada", vinculo: linhaEntrada });

    await db.exec("RESET ROLE");
    expect((await db.query("SELECT texto FROM mimo_whatsapp_eventos WHERE lead_id=$1 AND direcao='enviada'", [lead])).rows).toEqual([{ texto: "Olá!" }]);
    await db.exec("SET ROLE service_role");
    const recebido = await db.query("SELECT mimo_receber_whatsapp($1,$2,repeat('b',64),'parar','5511999990001','Contato','Não me envie mais mensagens',clock_timestamp(),false) AS lead", [linhaFechamento, admin]);
    expect(recebido.rows).toEqual([{ lead }]);
    expect(await op("reservar", { ...mensagem, solicitacao: crypto.randomUUID() })).toEqual({ estado: "bloqueada" });
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT direcao FROM mimo_whatsapp_eventos WHERE lead_id=$1 AND message_id='parar'", [lead])).rows).toEqual([{ direcao: "recebida" }]);
  } finally {
    await db.close();
  }
}, 30000);
