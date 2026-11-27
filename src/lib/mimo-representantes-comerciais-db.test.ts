import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";

// Dados 100% sintéticos: nenhum nome real de representante.
const E = "10000000-0000-4000-8000-000000000001",
  OUTRA = "10000000-0000-4000-8000-000000000002",
  ADM = "20000000-0000-4000-8000-000000000001",
  GES = "20000000-0000-4000-8000-000000000002",
  VEN = "20000000-0000-4000-8000-000000000003",
  MKT = "20000000-0000-4000-8000-000000000004",
  U1 = "30000000-0000-4000-8000-000000000001",
  U2 = "30000000-0000-4000-8000-000000000002";
const H1 = "a".repeat(64),
  H2 = "b".repeat(64);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
 CREATE TABLE empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
 CREATE TABLE empresa_membros(empresa_id uuid,user_id uuid,papel empresa_papel,ativo boolean);
 CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
 CREATE TABLE mimo_carteira_unidades(id uuid PRIMARY KEY,empresa_id uuid NOT NULL,nome text,uf text,UNIQUE(empresa_id,id));
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 INSERT INTO empresas VALUES('${E}','mimo',true),('${OUTRA}','outra',true);
 INSERT INTO empresa_membros VALUES('${E}','${ADM}','administrador',true),('${E}','${GES}','gestor',true),('${E}','${VEN}','vendedor',true),('${E}','${MKT}','marketing',true);
 INSERT INTO mimo_carteira_unidades VALUES('${U1}','${E}','Loja Alfa','PR'),('${U2}','${E}','Loja Beta','SC');`);
  const sql = readFileSync("docs/migracoes-preparadas/mimo-representantes-comerciais.sql", "utf8");
  expect([...sql].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  await db.exec(sql);
}, 60000);
afterAll(async () => {
  await db?.close();
});

async function como<T>(user: string, fn: () => Promise<T>) {
  await db.exec(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${user}',false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const rpc = (nome: string, dados: unknown, empresa = E) =>
  db.query<{ r: Record<string, unknown> }>(`SELECT public.${nome}($1,$2::jsonb) r`, [
    empresa,
    JSON.stringify(dados),
  ]);
const importar = (dados: unknown) => rpc("mimo_rep_comerciais_importar", dados);
const PLANILHA = {
  hash: H1,
  representantes: [
    { nome: "Representante Sul Um", comissao_bps: 500 },
    { nome: "Representante Sul Dois", comissao_bps: 350 },
  ],
  territorios: [
    { uf: "PR", nome: "Representante Sul Um", principal: true, regiao: "Sul", estado: "Paraná" },
    { uf: "PR", nome: "Representante Sul Dois", principal: false, regiao: "Sul", estado: "Paraná" },
    {
      uf: "SC",
      nome: "Representante Sul Dois",
      principal: true,
      regiao: "Sul",
      estado: "Santa Catarina",
    },
    {
      uf: "SC",
      nome: "Representante Sul Um",
      principal: false,
      regiao: "Sul",
      estado: "Santa Catarina",
    },
  ],
};
const contar = async (tabela: string) =>
  Number((await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${tabela}`)).rows[0].n);

it("SQL é somente ASCII e só gestão chama os RPCs", async () => {
  for (const u of [VEN, MKT, "20000000-0000-4000-8000-00000000000f"])
    await expect(como(u, () => importar(PLANILHA))).rejects.toThrow(/Acesso negado/);
  await expect(
    como(ADM, () => rpc("mimo_rep_comerciais_importar", PLANILHA, OUTRA)),
  ).rejects.toThrow(/Acesso negado/);
  await expect(
    como(ADM, () => db.query("SELECT public.mimo_rep_exigir_gestao($1)", [E])),
  ).rejects.toThrow(/permission denied/);
});

it("importa a planilha e reimportar o mesmo conteúdo não altera dados", async () => {
  const r = await como(ADM, () => importar(PLANILHA));
  expect(r.rows[0].r).toEqual({ criados: 2, atualizados: 0, inalterados: 0, territorios: 4 });
  const antes = await db.query(
    "SELECT * FROM mimo_rep_comerciais_territorios ORDER BY uf,representante_id",
  );
  const historico = await contar("mimo_rep_comerciais_historico");
  const r2 = await como(GES, () => importar({ ...PLANILHA, hash: H2 }));
  expect(r2.rows[0].r).toEqual({ criados: 0, atualizados: 0, inalterados: 2, territorios: 0 });
  expect(
    (await db.query("SELECT * FROM mimo_rep_comerciais_territorios ORDER BY uf,representante_id"))
      .rows,
  ).toEqual(antes.rows);
  // Só a linha de auditoria da tentativa.
  expect(await contar("mimo_rep_comerciais_historico")).toBe(historico + 1);
  const principais = await db.query<{ uf: string; nome: string }>(
    "SELECT t.uf,r.nome FROM mimo_rep_comerciais_territorios t JOIN mimo_rep_comerciais r ON r.id=t.representante_id WHERE t.principal ORDER BY uf",
  );
  expect(principais.rows).toEqual([
    { uf: "PR", nome: "Representante Sul Um" },
    { uf: "SC", nome: "Representante Sul Dois" },
  ]);
});

it("reimportação troca principal, atualiza comissão e audita cada mudança", async () => {
  const r = await como(ADM, () =>
    importar({
      hash: H1,
      representantes: [
        { nome: "representante  sul um", comissao_bps: 350 },
        { nome: "Representante Sul Dois", comissao_bps: 350 },
      ],
      territorios: [
        {
          uf: "PR",
          nome: "Representante Sul Dois",
          principal: true,
          regiao: "Sul",
          estado: "Paraná",
        },
        {
          uf: "PR",
          nome: "Representante Sul Um",
          principal: false,
          regiao: "Sul",
          estado: "Paraná",
        },
      ],
    }),
  );
  expect(r.rows[0].r).toEqual({ criados: 0, atualizados: 1, inalterados: 1, territorios: 2 });
  expect(await contar("mimo_rep_comerciais")).toBe(2);
  const pr = await db.query<{ nome: string; principal: boolean }>(
    "SELECT r.nome,t.principal FROM mimo_rep_comerciais_territorios t JOIN mimo_rep_comerciais r ON r.id=t.representante_id WHERE uf='PR' ORDER BY r.nome",
  );
  expect(pr.rows).toEqual([
    { nome: "Representante Sul Dois", principal: true },
    { nome: "Representante Sul Um", principal: false },
  ]);
  // SC não estava no arquivo: continua igual.
  expect(await contar("mimo_rep_comerciais_territorios")).toBe(4);
  const h = await db.query<{ acao: string; antes: { principal: boolean } }>(
    "SELECT acao,antes FROM mimo_rep_comerciais_historico WHERE entidade='territorio' AND referencia='PR' AND acao='importar_editar' ORDER BY id",
  );
  expect(h.rows.map((x) => x.antes.principal).sort()).toEqual([false, true]);
});

it("recusa dois principais na mesma UF e representante repetido", async () => {
  await expect(
    como(ADM, () =>
      importar({
        ...PLANILHA,
        territorios: PLANILHA.territorios.map((t) =>
          t.uf === "PR" ? { ...t, principal: true } : t,
        ),
      }),
    ),
  ).rejects.toThrow(/mais de um principal/);
  await expect(
    como(ADM, () =>
      importar({
        ...PLANILHA,
        representantes: [
          ...PLANILHA.representantes,
          { nome: "REPRESENTANTE SUL UM", comissao_bps: 1 },
        ],
      }),
    ),
  ).rejects.toThrow(/repetido/);
});

it("cadastro com versão otimista e conflito de principal", async () => {
  const novo = await como(GES, () =>
    rpc("mimo_rep_comercial_salvar", {
      id: null,
      versao: null,
      nome: "Representante Centro",
      ativo: true,
      comissao_bps: 425,
      telefone: "",
      email: "",
      observacoes: "",
      territorios: [
        { uf: "GO", principal: true },
        { uf: "DF", principal: false },
      ],
    }),
  );
  const rep = novo.rows[0].r as { id: string; versao: number };
  await expect(
    como(GES, () =>
      rpc("mimo_rep_comercial_salvar", {
        id: rep.id,
        versao: rep.versao,
        nome: "Representante Centro",
        ativo: true,
        comissao_bps: 425,
        territorios: [{ uf: "PR", principal: true }],
      }),
    ),
  ).rejects.toThrow(/PR ja tem representante principal/);
  const editado = await como(GES, () =>
    rpc("mimo_rep_comercial_salvar", {
      id: rep.id,
      versao: rep.versao,
      nome: "Representante Centro",
      ativo: true,
      comissao_bps: 450,
      territorios: [{ uf: "GO", principal: true }],
    }),
  );
  expect(editado.rows[0].r).toMatchObject({ versao: 2, comissao_bps: 450 });
  await expect(
    como(GES, () =>
      rpc("mimo_rep_comercial_salvar", {
        id: rep.id,
        versao: 1,
        nome: "Representante Centro",
        ativo: false,
        comissao_bps: 450,
        territorios: [],
      }),
    ),
  ).rejects.toThrow(/alterado/);
  await expect(
    como(GES, () =>
      rpc("mimo_rep_comercial_salvar", {
        id: null,
        versao: null,
        nome: "representante centro",
        ativo: true,
        comissao_bps: 1,
        territorios: [],
      }),
    ),
  ).rejects.toThrow(/Ja existe/);
});

it("atribuição manual vence, exige motivo, versão e representante ativo", async () => {
  const dois = (
    await db.query<{ id: string }>(
      "SELECT id FROM mimo_rep_comerciais WHERE nome='Representante Sul Dois'",
    )
  ).rows[0].id;
  await expect(
    como(ADM, () =>
      rpc("mimo_rep_comercial_cliente", {
        unidade_id: U1,
        representante_id: dois,
        motivo: "",
        versao: null,
      }),
    ),
  ).rejects.toThrow(/motivo/);
  const a = await como(ADM, () =>
    rpc("mimo_rep_comercial_cliente", {
      unidade_id: U1,
      representante_id: dois,
      motivo: "Cliente atendido pelo secundário",
      versao: null,
    }),
  );
  expect(a.rows[0].r).toMatchObject({ versao: 1, representante_id: dois });
  await expect(
    como(ADM, () =>
      rpc("mimo_rep_comercial_cliente", {
        unidade_id: U1,
        representante_id: null,
        motivo: "Voltar",
        versao: null,
      }),
    ),
  ).rejects.toThrow(/alterada/);
  const b = await como(ADM, () =>
    rpc("mimo_rep_comercial_cliente", {
      unidade_id: U1,
      representante_id: null,
      motivo: "Voltar ao automático",
      versao: 1,
    }),
  );
  expect(b.rows[0].r).toMatchObject({ versao: 2, representante_id: null });
  await expect(
    como(VEN, () =>
      rpc("mimo_rep_comercial_cliente", {
        unidade_id: U2,
        representante_id: dois,
        motivo: "Tentativa",
        versao: null,
      }),
    ),
  ).rejects.toThrow(/Acesso negado/);
  const h = await db.query<{ acao: string }>(
    `SELECT acao FROM mimo_rep_comerciais_historico WHERE entidade='cliente' AND referencia='${U1}' ORDER BY id`,
  );
  expect(h.rows.map((x) => x.acao)).toEqual(["atribuir", "voltar_automatico"]);
});

it("RLS: só gestão lê; ninguém escreve direto; histórico é imutável", async () => {
  expect((await como(ADM, () => db.query("SELECT * FROM mimo_rep_comerciais"))).rows.length).toBe(
    3,
  );
  expect((await como(VEN, () => db.query("SELECT * FROM mimo_rep_comerciais"))).rows).toEqual([]);
  expect(
    (await como(MKT, () => db.query("SELECT * FROM mimo_rep_comerciais_clientes"))).rows,
  ).toEqual([]);
  await expect(
    como(ADM, () => db.query("UPDATE mimo_rep_comerciais SET comissao_bps=10000")),
  ).rejects.toThrow(/permission denied/);
  await expect(
    como(ADM, () =>
      db.query(
        "INSERT INTO mimo_rep_comerciais_historico(empresa_id,entidade,referencia,acao,ator_id) VALUES($1,'cliente','x','y',$2)",
        [E, ADM],
      ),
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(db.query("DELETE FROM mimo_rep_comerciais_historico")).rejects.toThrow(
    /somente de insercao/,
  );
  await expect(db.query("UPDATE mimo_rep_comerciais_historico SET acao='x'")).rejects.toThrow(
    /somente de insercao/,
  );
});
