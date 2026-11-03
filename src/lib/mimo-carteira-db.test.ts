import { PGlite } from "@electric-sql/pglite";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const EMP = "10000000-0000-4000-8000-000000000001",
  OTHER = "10000000-0000-4000-8000-000000000002";
const ADMIN = "20000000-0000-4000-8000-000000000001",
  VENDEDOR = "20000000-0000-4000-8000-000000000002",
  COLEGA = "20000000-0000-4000-8000-000000000003";
let db: PGlite;
async function user(id: string) {
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`);
}
async function rpc(nome: string, dados: unknown, empresa = EMP) {
  return (
    await db.query<{ r: Record<string, unknown> }>(`select public.${nome}($1::uuid,$2::jsonb) r`, [
      empresa,
      JSON.stringify(dados),
    ])
  ).rows[0].r;
}
const unidade = (nome: string, responsavel_id: string | null = VENDEDOR) => ({
  nome,
  cnpj: "",
  rede: "",
  grupo: "",
  razao_social: "",
  canal: "",
  cidade: "Curitiba",
  uf: "PR",
  instagram: "",
  classe: "A",
  situacao: "Não abordado",
  responsavel_id,
  observacoes: "",
});
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
 CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
 CREATE TABLE public.empresa_membros(empresa_id uuid,user_id uuid,papel public.empresa_papel,ativo boolean,PRIMARY KEY(empresa_id,user_id));
 CREATE FUNCTION public.is_membro_empresa(e uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo) $$;
 CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
 CREATE FUNCTION public.empresa_papel_de(e uuid,u uuid) RETURNS public.empresa_papel LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT papel FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo $$;
 INSERT INTO auth.users VALUES('${ADMIN}'),('${VENDEDOR}'),('${COLEGA}');
 INSERT INTO public.empresas VALUES('${EMP}','mimo',true),('${OTHER}','outra',true);
 INSERT INTO public.empresa_membros VALUES('${EMP}','${ADMIN}','administrador',true),('${EMP}','${VENDEDOR}','vendedor',true),('${EMP}','${COLEGA}','vendedor',true),('${OTHER}','${ADMIN}','administrador',true);
 `);
  await db.exec(readFileSync("drizzle/migrations/0008_mimo_leads_comerciais.sql", "utf8"));
  await db.exec(`CREATE FUNCTION public.pode_ver_mimo_lead(l uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.mimo_leads WHERE id=l AND public.is_membro_empresa(empresa_id,u) AND (responsavel_id=u OR public.tem_papel_empresa(empresa_id,u,ARRAY['administrador','gestor']::public.empresa_papel[]))) $$;
 DROP POLICY mimo_leads_read ON public.mimo_leads;CREATE POLICY mimo_leads_read ON public.mimo_leads FOR SELECT TO authenticated USING(public.pode_ver_mimo_lead(id,auth.uid()));`);
  await db.exec(readFileSync("docs/migracoes-preparadas/mimo-carteira.sql", "utf8")).catch((e) => {
    throw Error(
      `SQL carteira: ${e.message}; posição=${e.position}; contexto=${e.where}; interno=${e.internalQuery}`,
    );
  });
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("carteira: PostgreSQL isolado", () => {
  it("executa SQL e impede leitura cruzada e escrita direta", async () => {
    await user(ADMIN);
    const u = await rpc("mimo_carteira_gravar", unidade("Unidade privada"));
    await user(COLEGA);
    expect(
      (await db.query("select id from public.mimo_carteira_unidades where id=$1", [u.id])).rows,
    ).toHaveLength(0);
    await expect(rpc("mimo_carteira_gravar", { ...u, nome: "Invasão" })).rejects.toThrow();
    await expect(
      db.query("update public.mimo_carteira_unidades set nome=$1 where id=$2", ["Forjado", u.id]),
    ).rejects.toThrow();
    await user(VENDEDOR);
    expect(
      (await db.query("select id from public.mimo_carteira_lista where id=$1", [u.id])).rows,
    ).toHaveLength(1);
  });
  it("rejeita empresa diferente, responsável inválido e CNPJ forjado", async () => {
    await user(ADMIN);
    await expect(rpc("mimo_carteira_gravar", unidade("Outra empresa"), OTHER)).rejects.toThrow();
    await expect(
      rpc("mimo_carteira_gravar", { ...unidade("CNPJ ruim"), cnpj: "11222333000182" }),
    ).rejects.toThrow();
    await expect(
      rpc(
        "mimo_carteira_gravar",
        unidade("Responsável ruim", "90000000-0000-4000-8000-000000000001"),
      ),
    ).rejects.toThrow();
  });
  it("preserva versão concorrente e registra auditoria", async () => {
    await user(ADMIN);
    const u = await rpc("mimo_carteira_gravar", unidade("Concorrência"));
    await rpc("mimo_carteira_gravar", { ...u, nome: "Atualizada" });
    await expect(rpc("mimo_carteira_gravar", { ...u, nome: "Antiga" })).rejects.toThrow();
    const h = await db.query("select * from public.mimo_carteira_historico where unidade_id=$1", [
      u.id,
    ]);
    expect(h.rows).toHaveLength(2);
  });
  it("compartilha contatos sem permitir alteração por vendedor de outra carteira", async () => {
    await user(ADMIN);
    const a = await rpc("mimo_carteira_gravar", unidade("Contato A"));
    const b = await rpc("mimo_carteira_gravar", unidade("Contato B", COLEGA));
    const c = await rpc("mimo_carteira_contato", {
      unidade_id: a.id,
      nome: "Compradora",
      telefone: "",
      whatsapp: "41999999999",
      email: "",
      papel: "Comprador",
    });
    await rpc("mimo_carteira_contato", {
      id: c.id,
      unidade_id: b.id,
      papel: "Comprador",
      operacao: "associar",
    });
    await user(VENDEDOR);
    expect(
      (await db.query("select * from public.mimo_carteira_contatos where id=$1", [c.id])).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select * from public.mimo_carteira_contato_unidades where contato_id=$1", [
          c.id,
        ])
      ).rows,
    ).toHaveLength(1);
    await expect(
      rpc("mimo_carteira_contato", { ...c, unidade_id: a.id, papel: "Comprador", nome: "Forjado" }),
    ).rejects.toThrow();
  });
  it("reagenda e conclui uma atividade sem reabrir resultado", async () => {
    await user(ADMIN);
    const u = await rpc("mimo_carteira_gravar", unidade("Atividades"));
    const a = await rpc("mimo_carteira_atividade", {
      unidade_id: u.id,
      tipo: "WhatsApp",
      prazo: "2026-11-04T12:00:00Z",
      descricao: "Primeira conversa",
    });
    await rpc("mimo_carteira_atividade", {
      id: a.id,
      unidade_id: u.id,
      operacao: "reagendar",
      prazo: "2026-11-05T12:00:00Z",
    });
    const encerrada = await rpc("mimo_carteira_atividade", {
      id: a.id,
      unidade_id: u.id,
      resultado: "Interessado",
    });
    expect(encerrada.concluida_em).toBeTruthy();
    await expect(
      rpc("mimo_carteira_atividade", { id: a.id, unidade_id: u.id, resultado: "Outro resultado" }),
    ).rejects.toThrow();
  });
  it("importa por lote e retoma sem duplicar nem sobrescrever", async () => {
    await user(ADMIN);
    const doc = {
      hash: "a".repeat(64),
      plano_hash: "b".repeat(64),
      total: 2,
      linhas: [
        { linha: 3, unidade: unidade("Importada 1"), contatos: [], originais: { CNPJ: "" } },
      ],
    };
    expect((await rpc("mimo_carteira_importar", doc)).processados).toBe(1);
    expect((await rpc("mimo_carteira_importar", doc)).processados).toBe(1);
    expect(
      (
        await rpc("mimo_carteira_importar", {
          ...doc,
          linhas: [{ linha: 4, unidade: unidade("Importada 2"), contatos: [], originais: {} }],
        })
      ).processados,
    ).toBe(2);
    await expect(rpc("mimo_carteira_importar",{...doc,linhas:[{...doc.linhas[0],unidade:unidade("Tentativa de sobrescrita")}]})).rejects.toThrow();
    const revisao=await rpc("mimo_carteira_importar",{...doc,plano_hash:"c".repeat(64),total:1});expect(revisao.ignorados).toBe(1);expect(revisao.criados).toBe(0);
    await user(VENDEDOR);
    await expect(rpc("mimo_carteira_importar", doc)).rejects.toThrow();
  });
  it("liga múltiplas unidades a um lead com retry idempotente", async () => {
    await user(ADMIN);
    const a = await rpc("mimo_carteira_gravar", unidade("Negociação A"));
    const b = await rpc("mimo_carteira_gravar", unidade("Negociação B"));
    const dados = {
      unidades: [a.id, b.id],
      principal: a.id,
      lead_id: null,
      operacao_id: "30000000-0000-4000-8000-000000000001",
    };
    const r = await rpc("mimo_carteira_negociar", dados);
    expect((await rpc("mimo_carteira_negociar", dados)).lead_id).toBe(r.lead_id);
    expect(
      (
        await db.query("select * from public.mimo_carteira_negociacoes where lead_id=$1", [
          r.lead_id,
        ])
      ).rows,
    ).toHaveLength(2);
    const lead = (
      await db.query<{ valor_pedido: unknown; conversao_em: unknown }>(
        "select valor_pedido,conversao_em from public.mimo_leads where id=$1",
        [r.lead_id],
      )
    ).rows[0];
    expect(lead.valor_pedido).toBeNull();
    expect(lead.conversao_em).toBeNull();
  });
  it("atribui em lote atomicamente e nega autoelevação", async () => {
    await user(ADMIN);
    const u = await rpc("mimo_carteira_gravar", unidade("Atribuição"));
    await expect(
      rpc("mimo_carteira_atribuir", {
        ids: [u.id, "90000000-0000-4000-8000-000000000001"],
        responsavel_id: COLEGA,
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ responsavel_id: string }>(
          "select responsavel_id from public.mimo_carteira_unidades where id=$1",
          [u.id],
        )
      ).rows[0].responsavel_id,
    ).toBe(VENDEDOR);
    await user(VENDEDOR);
    await expect(
      rpc("mimo_carteira_atribuir", { ids: [u.id], responsavel_id: VENDEDOR }),
    ).rejects.toThrow();
  });
  it("mantém páginas de 30 unidades em uma base sintética de 10 mil", async () => {
    await db.exec("RESET ROLE");
    await db.query(
      `INSERT INTO public.mimo_carteira_unidades(empresa_id,nome,responsavel_id) SELECT $1,'Benchmark '||lpad(n::text,5,'0'),$2 FROM generate_series(1,10000) n`,
      [EMP, VENDEDOR],
    );
    await user(VENDEDOR);
    const inicio = performance.now();
    const r = await db.query(
      "SELECT id,nome,proxima_acao,ultimo_contato FROM public.mimo_carteira_lista WHERE empresa_id=$1 ORDER BY nome,id LIMIT 30 OFFSET 5000",
      [EMP],
    );
    expect(r.rows).toHaveLength(30);
    mkdirSync('.cache',{recursive:true});writeFileSync('.cache/mimo-carteira-benchmark.json',JSON.stringify({unidades:10000,tamanhoPagina:30,offset:5000,milissegundos:performance.now()-inicio,ambiente:'PostgreSQL em memória, sem rede'},null,2));
    console.info(
      `Carteira: página intermediária de 30/10000 em ${(performance.now() - inicio).toFixed(1)} ms (PostgreSQL em memória, sem rede).`,
    );
  }, 30000);
  it("nega operação de membro desativado e preserva histórico imutável", async () => {
    await db.exec(
      `RESET ROLE; UPDATE public.empresa_membros SET ativo=false WHERE empresa_id='${EMP}' AND user_id='${COLEGA}'`,
    );
    await user(COLEGA);
    await expect(rpc("mimo_carteira_gravar", unidade("Inativo"))).rejects.toThrow();
    await user(ADMIN);
    await expect(db.exec("DELETE FROM public.mimo_carteira_historico")).rejects.toThrow();
  });
});
