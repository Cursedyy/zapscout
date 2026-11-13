import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const EMP = "10000000-0000-4000-8000-000000000001",
  USR = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
const dados = {
  nome: "Cadastro sintético",
  whatsapp: "11999991234",
  rede: "Instagram",
  perfil: "sintetico",
  cidade: "São Paulo",
  uf: "SP",
  seguidores: 5000,
  visualizacoes: "Até 1 mil",
  nicho: "Outros",
  parceria: "Ambas as opções",
  consentimento: true,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
  CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
  CREATE TABLE public.empresa_membros(empresa_id uuid,user_id uuid,papel public.empresa_papel,ativo boolean);
  CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.empresa_membros WHERE empresa_id=e AND user_id=u AND ativo AND papel=ANY(p)) $$;
  GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role; GRANT SELECT ON public.empresas TO authenticated;
  INSERT INTO public.empresas VALUES('${EMP}','mimo',true);
  INSERT INTO public.empresa_membros VALUES('${EMP}','${USR}','marketing',true);`);
  await db.exec(readFileSync("docs/migracoes-preparadas/mimo-influenciadores.sql", "utf8"));
  await db.exec(
    readFileSync("docs/migracoes-preparadas/mimo-influenciadores-opcoes-utf8.sql", "utf8"),
  );
  await db.exec(
    readFileSync("docs/migracoes-preparadas/mimo-influenciadores-duplicidade.sql", "utf8"),
  );
  await db.exec(
    readFileSync("docs/migracoes-preparadas/mimo-influenciadores-estados-eua.sql", "utf8"),
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
async function inscrever(payload = dados, hash = "a".repeat(64)) {
  return db.query<{ r: string }>("select public.mimo_inscrever_influenciador($1::jsonb,$2) r", [
    JSON.stringify(payload),
    hash,
  ]);
}
it("insere via serviço e torna repetição idempotente sem apagar avaliação", async () => {
  await db.exec("SET ROLE service_role");
  await inscrever();
  await inscrever();
  expect((await db.query("select * from mimo_influenciadores")).rows).toHaveLength(1);
  await db.exec(`RESET ROLE;SET request.jwt.claim.sub='${USR}';SET ROLE authenticated`);
  expect((await db.query("select * from mimo_influenciadores")).rows).toHaveLength(1);
  await db.exec("UPDATE mimo_influenciadores SET etapa='Confirmado',notas='Avaliado'");
  expect(
    (await db.query<{ versao: number }>("select versao from mimo_influenciadores")).rows[0].versao,
  ).toBe(2);
  expect((await db.query("select * from mimo_influenciadores_historico")).rows).toHaveLength(2);
  await expect(db.exec("UPDATE mimo_influenciadores SET seguidores=999999")).rejects.toThrow();
  await expect(db.exec("DELETE FROM mimo_influenciadores_historico")).rejects.toThrow();
  await db.exec("RESET ROLE;SET ROLE service_role");
  await inscrever({ ...dados, nome: "Tentativa de sobrescrita" });
  expect(
    (await db.query<{ etapa: string }>("select etapa from mimo_influenciadores")).rows[0].etapa,
  ).toBe("Confirmado");
});
it("nega público, vendedor e membro inativo", async () => {
  await db.exec("RESET ROLE;SET ROLE anon");
  await expect(db.exec("SELECT * FROM mimo_influenciadores")).rejects.toThrow();
  await expect(inscrever()).rejects.toThrow();
  await db.exec(
    `RESET ROLE;UPDATE empresa_membros SET papel='vendedor';SET request.jwt.claim.sub='${USR}';SET ROLE authenticated`,
  );
  expect((await db.query("select * from mimo_influenciadores")).rows).toHaveLength(0);
  await db.exec(
    "RESET ROLE;UPDATE empresa_membros SET papel='marketing',ativo=false;SET ROLE authenticated",
  );
  expect((await db.query("select * from mimo_influenciadores_historico")).rows).toHaveLength(0);
});
it("limita tentativas na janela sem expor inscrições", async () => {
  await db.exec("RESET ROLE;SET ROLE service_role");
  for (let i = 0; i < 30; i++) await inscrever(dados, "b".repeat(64));
  expect((await inscrever(dados, "b".repeat(64))).rows).toEqual([{ r: "limite" }]);
});
it("bloqueia formatos equivalentes de telefone, troca de perfil e troca de telefone", async () => {
  await db.exec("RESET ROLE;SET ROLE service_role");
  for (const whatsapp of [
    "(11) 99999-1234",
    "+55 11 99999-1234",
    "0055 11 99999-1234",
    "1199991234",
  ]) {
    expect(
      (await inscrever({ ...dados, whatsapp, perfil: "outro_perfil" }, "c".repeat(64))).rows,
    ).toEqual([{ r: "duplicado" }]);
  }
  expect(
    (
      await inscrever(
        { ...dados, whatsapp: "21987654321", perfil: "https://www.instagram.com/SINTETICO/" },
        "c".repeat(64),
      )
    ).rows,
  ).toEqual([{ r: "duplicado" }]);
  await expect(
    db.exec(
      "INSERT INTO mimo_influenciadores SELECT gen_random_uuid(),empresa_id,campanha,nome,whatsapp,rede,'novo_perfil',cidade,uf,seguidores,visualizacoes,nicho,parceria,consentimento,aviso_versao,etapa,notas,versao,created_at,updated_at,excluido_em,excluido_por FROM mimo_influenciadores WHERE perfil='sintetico'",
    ),
  ).rejects.toThrow(/unique constraint/);
});
it("mantém só um registro quando várias inscrições iguais chegam juntas", async () => {
  await db.exec("RESET ROLE;SET ROLE service_role");
  const resultados = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      inscrever(
        { ...dados, whatsapp: "21988881234", perfil: "concorrente" },
        i.toString(16).padStart(64, "0"),
      ),
    ),
  );
  expect(resultados.filter((r) => r.rows[0].r === "recebido")).toHaveLength(1);
  expect(resultados.filter((r) => r.rows[0].r === "duplicado")).toHaveLength(9);
  expect(
    (await db.query("SELECT id FROM mimo_influenciadores WHERE perfil='concorrente'")).rows,
  ).toHaveLength(1);
});
it("exige todos os campos também no banco, mesmo fora do formulário", async () => {
  await db.exec("RESET ROLE;SET ROLE service_role");
  for (const campo of Object.keys(dados)) {
    const incompleto: Record<string, unknown> = {
      ...dados,
      whatsapp: "21977771234",
      perfil: "incompleto",
    };
    delete incompleto[campo];
    await expect(inscrever(incompleto as typeof dados, "e".repeat(64))).rejects.toThrow();
  }
  expect(
    (await db.query("SELECT id FROM mimo_influenciadores WHERE perfil='incompleto'")).rows,
  ).toHaveLength(0);
});
it("exclui com papel e versão verificados sem liberar o número para duplicação", async () => {
  await db.exec(
    `RESET ROLE;UPDATE empresa_membros SET papel='marketing',ativo=true;SET request.jwt.claim.sub='${USR}';SET ROLE authenticated`,
  );
  const row = (
    await db.query<{ id: string; versao: number }>(
      "SELECT id,versao FROM mimo_influenciadores WHERE perfil='sintetico'",
    )
  ).rows[0];
  expect((await db.query("SELECT mimo_influenciador_excluir($1,999) ok", [row.id])).rows).toEqual([
    { ok: false },
  ]);
  expect(
    (await db.query("SELECT mimo_influenciador_excluir($1,$2) ok", [row.id, row.versao])).rows,
  ).toEqual([{ ok: true }]);
  expect(
    (
      await db.query(
        "SELECT id FROM mimo_influenciadores WHERE perfil='sintetico' AND excluido_em IS NULL",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ excluido_por: string }>(
        "SELECT excluido_por FROM mimo_influenciadores WHERE perfil='sintetico'",
      )
    ).rows[0].excluido_por,
  ).toBe(USR);
  expect(
    (
      await db.query(
        "SELECT id FROM mimo_influenciadores_historico WHERE influenciador_id=$1 AND acao='excluido'",
        [row.id],
      )
    ).rows,
  ).toHaveLength(1);
  await db.exec("RESET ROLE;UPDATE empresa_membros SET papel='vendedor';SET ROLE authenticated");
  await expect(
    db.query("SELECT mimo_influenciador_excluir($1,$2)", [row.id, row.versao]),
  ).rejects.toThrow(/Access denied/);
  await db.exec("RESET ROLE;SET ROLE service_role");
  expect((await inscrever(dados, "f".repeat(64))).rows).toEqual([{ r: "duplicado" }]);
});

it("aceita estados americanos sem confundir com as UFs brasileiras", async () => {
  await db.exec("RESET ROLE;SET ROLE service_role;BEGIN");
  try {
    for (const [i, uf] of [
      "US-FL",
      "US-AL",
      "US-MT",
      "US-PA",
      "US-DC",
      "AL",
      "MT",
      "PA",
    ].entries()) {
      expect(
        (
          await inscrever(
            { ...dados, uf, perfil: "estado" + i, whatsapp: "3199999000" + i },
            "c".repeat(64),
          )
        ).rows,
      ).toEqual([{ r: "recebido" }]);
    }
    await expect(
      inscrever(
        { ...dados, uf: "US-XX", perfil: "estadoinvalido", whatsapp: "31999990100" },
        "c".repeat(64),
      ),
    ).rejects.toThrow(/check constraint/);
  } finally {
    await db.exec("ROLLBACK");
  }
});
