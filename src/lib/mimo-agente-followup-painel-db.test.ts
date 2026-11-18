import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const empresa = "10000000-0000-4000-8000-000000000001";
const gestor = "20000000-0000-4000-8000-000000000001";
const vendedor = "20000000-0000-4000-8000-000000000002";
const lead = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

it("agenda tarefas auditadas com contexto e respeita tentativas, responsáveis, opt-out e pendências existentes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE empresas(id uuid PRIMARY KEY, slug text, ativa boolean);
      CREATE TABLE empresa_membros(empresa_id uuid, user_id uuid, papel text, ativo boolean);
      CREATE TABLE mimo_leads(id uuid PRIMARY KEY, empresa_id uuid, responsavel_id uuid, etapa text, updated_at timestamptz);
      CREATE FUNCTION pode_ver_mimo_lead(l uuid,u uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT EXISTS(SELECT 1 FROM mimo_leads x JOIN empresa_membros m USING(empresa_id)
          WHERE x.id=l AND m.user_id=u AND m.ativo) $$;
      CREATE TABLE mimo_agente_config(empresa_id uuid PRIMARY KEY, modo text, atualizado_por uuid);
      CREATE TABLE mimo_agente_conversas(empresa_id uuid, lead_id uuid, piloto boolean, estado text, motivo text, resumo text);
      CREATE TABLE mimo_whatsapp_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid, lead_id uuid,
        direcao text, texto text, contato_em timestamptz, created_at timestamptz DEFAULT now());
      CREATE TABLE mimo_tira_pedidos(id uuid PRIMARY KEY, empresa_id uuid, lead_id uuid, versao int,
        status text, documento jsonb, pix jsonb, updated_at timestamptz);
      INSERT INTO empresas VALUES ('${empresa}', 'mimo', true);
      INSERT INTO empresa_membros VALUES ('${empresa}', '${gestor}', 'gestor', true),
        ('${empresa}', '${vendedor}', 'vendedor', true);
      INSERT INTO mimo_agente_config VALUES ('${empresa}', 'ativo', '${gestor}');
    `);
    for (const file of [
      "drizzle/migrations/0042_mimo_lead_followups.sql",
      "docs/migracoes-preparadas/mimo-followups-ia-painel.sql",
    ]) await db.exec(readFileSync(file, "utf8"));

    await db.exec(`
      UPDATE mimo_agente_config SET followups_painel_desde = now() - interval '1 day';
      INSERT INTO mimo_leads VALUES
        ('${lead(1)}','${empresa}','${vendedor}','em_negociacao',now()-interval '15 min'),
        ('${lead(2)}','${empresa}','${vendedor}','contato_realizado',now()-interval '15 min'),
        ('${lead(3)}','${empresa}',null,'novo',now()-interval '15 min'),
        ('${lead(4)}','${empresa}','${vendedor}','novo',now()-interval '15 min'),
        ('${lead(5)}','${empresa}','${vendedor}','novo',now()-interval '15 min'),
        ('${lead(6)}','${empresa}','${vendedor}','perdido',now()-interval '15 min'),
        ('${lead(7)}','${empresa}','${vendedor}','em_negociacao',now()-interval '2 days'),
        ('${lead(8)}','${empresa}','${vendedor}','em_negociacao',now()-interval '15 min'),
        ('${lead(9)}','${empresa}','${vendedor}','contato_realizado',now()-interval '15 min'),
        ('${lead(10)}','${empresa}','${vendedor}','novo',now()-interval '15 min'),
        ('${lead(11)}','${empresa}','${vendedor}','em_negociacao',now()-interval '15 min');
      INSERT INTO mimo_whatsapp_eventos (empresa_id,lead_id,direcao,texto,contato_em)
        VALUES ('${empresa}','${lead(2)}','recebida','Pode me chamar daqui a 3 dias?',now()-interval '15 min'),
        ('${empresa}','${lead(10)}','recebida','Não me envie mais mensagens',now()-interval '15 min');
      INSERT INTO mimo_agente_conversas VALUES
        ('${empresa}','${lead(4)}',false,'bloqueada','parar',''),
        ('${empresa}','${lead(9)}',false,'humano','pre_qualificacao_pendente_revisao','Assunto: revenda.');
      INSERT INTO mimo_tira_pedidos VALUES
        (gen_random_uuid(),'${empresa}','${lead(1)}',1,'aguardando_pagamento','{}',null,now()-interval '14 min'),
        (gen_random_uuid(),'${empresa}','${lead(8)}',1,'faturado','{}',null,now()-interval '14 min'),
        (gen_random_uuid(),'${empresa}','${lead(11)}',1,'confirmado','{"pagamento":{"forma":"pix"}}',null,now()-interval '14 min');
      INSERT INTO mimo_lead_followups (id,empresa_id,lead_id,responsavel_id,prazo,observacao)
        VALUES (gen_random_uuid(),'${empresa}','${lead(5)}','${vendedor}',now()+interval '5 days','Manual');
    `);
    await db.exec("SET ROLE authenticated");
    const agendar = () => db.query<{ n: number }>("SELECT mimo_followups_ia_agendar() AS n");
    await expect(agendar()).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE; SET ROLE service_role");
    expect((await agendar()).rows).toEqual([{ n: 5 }]);
    expect((await agendar()).rows).toEqual([{ n: 0 }]);
    const tarefas = (await db.query<{ lead_id: string; responsavel_id: string; observacao: string }>(
      "SELECT lead_id,responsavel_id,observacao FROM mimo_lead_followups WHERE origem='ia' ORDER BY lead_id",
    )).rows;
    expect(tarefas).toEqual([
      { lead_id: lead(1), responsavel_id: vendedor, observacao: expect.stringMatching(/Acompanhar o pagamento/) },
      { lead_id: lead(2), responsavel_id: vendedor, observacao: expect.stringMatching(/prazo pedido/) },
      { lead_id: lead(3), responsavel_id: gestor, observacao: expect.stringMatching(/Defina quem vai atender/) },
      { lead_id: lead(9), responsavel_id: vendedor, observacao: expect.stringMatching(/pré-qualificação/) },
      { lead_id: lead(11), responsavel_id: vendedor, observacao: expect.stringMatching(/Acompanhar o PIX/) },
    ]);
    await db.exec("RESET ROLE");
    const prazo = await db.query(
      "SELECT f.prazo = e.contato_em + interval '3 days' as exato FROM mimo_lead_followups f JOIN mimo_whatsapp_eventos e USING (lead_id)",
    );
    expect(prazo.rows).toEqual([{ exato: true }]);
    expect((await db.query("SELECT acao FROM mimo_lead_followup_historico ORDER BY lead_id")).rows)
      .toEqual(Array(5).fill({ acao: "agendar_ia" }));
    await db.exec(`SET ROLE service_role; UPDATE mimo_lead_followups SET estado='concluido' WHERE lead_id='${lead(2)}'`);
    expect((await agendar()).rows).toEqual([{ n: 0 }]);
    await db.exec("RESET ROLE");
    await db.exec(`UPDATE mimo_leads SET etapa='perdido' WHERE id IN ('${lead(1)}','${lead(5)}');`);
    await db.exec("SET ROLE service_role");
    expect((await agendar()).rows).toEqual([{ n: 0 }]);
    expect((await db.query(`SELECT estado,versao FROM mimo_lead_followups
      WHERE lead_id IN ('${lead(1)}','${lead(5)}') ORDER BY lead_id`)).rows).toEqual([
      { estado: "cancelado", versao: 2 },
      { estado: "pendente", versao: 1 },
    ]);
  } finally {
    await db.close();
  }
});
