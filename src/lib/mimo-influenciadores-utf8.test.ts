import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  ETAPAS_INFLUENCIADORES,
  NICHOS_INFLUENCIADORES,
  PARCERIAS_INFLUENCIADORES,
  VIEWS_INFLUENCIADORES,
} from "./mimo-influenciadores";

it("corrige a codificação aplicada e aceita todas as opções reais sem perder permissões", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid $$;
      CREATE TYPE public.empresa_papel AS ENUM('administrador','gestor','vendedor','marketing','administrativo');
      CREATE TABLE public.empresas(id uuid PRIMARY KEY,slug text,ativa boolean);
      INSERT INTO empresas VALUES('10000000-0000-4000-8000-000000000001','mimo',true);
      CREATE FUNCTION public.tem_papel_empresa(e uuid,u uuid,p public.empresa_papel[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
    const original = readFileSync("docs/migracoes-preparadas/mimo-influenciadores.sql", "utf8");
    // Reproduce UTF-8 bytes accidentally decoded as Windows-1252 during deployment.
    await db.exec(new TextDecoder("windows-1252").decode(new TextEncoder().encode(original)));
    const dados = {
      nome: "TESTE SINTÉTICO",
      whatsapp: "11000000000",
      rede: "Instagram",
      perfil: "teste_utf8",
      cidade: "São Paulo",
      uf: "SP",
      seguidores: 5000,
      visualizacoes: VIEWS_INFLUENCIADORES[0],
      nicho: NICHOS_INFLUENCIADORES[0],
      parceria: PARCERIAS_INFLUENCIADORES[2],
      consentimento: true,
    };
    const rpc = (d: unknown, hash: string) =>
      db.query("SELECT mimo_inscrever_influenciador($1::jsonb,$2) AS resultado", [
        JSON.stringify(d),
        hash,
      ]);
    await expect(rpc(dados, "d".repeat(64))).rejects.toThrow(/check constraint/);
    const correcao = readFileSync(
      "docs/migracoes-preparadas/mimo-influenciadores-opcoes-utf8.sql",
      "utf8",
    );
    expect(correcao).toMatch(/^[\x00-\x7F]*$/);
    await db.exec("BEGIN;" + correcao + "COMMIT;");
    await db.exec("SET ROLE service_role");
    let indice = 0;
    for (const visualizacoes of VIEWS_INFLUENCIADORES)
      for (const nicho of NICHOS_INFLUENCIADORES)
        for (const parceria of PARCERIAS_INFLUENCIADORES) {
          indice++;
          expect(
            (
              await rpc(
                {
                  ...dados,
                  whatsapp: `11${100000000 + indice}`,
                  perfil: `teste_utf8_${indice}`,
                  visualizacoes,
                  nicho,
                  parceria,
                },
                indice.toString(16).padStart(64, "0"),
              )
            ).rows,
          ).toEqual([{ resultado: "recebido" }]);
        }
    for (const etapa of ETAPAS_INFLUENCIADORES)
      await db.query("UPDATE mimo_influenciadores SET etapa=$1 WHERE perfil='teste_utf8_1'", [
        etapa,
      ]);
    expect(
      (await db.query<{ n: number }>("SELECT count(*)::int n FROM mimo_influenciadores")).rows[0].n,
    ).toBe(48);
    await db.exec("RESET ROLE;SET ROLE anon");
    await expect(db.query("SELECT * FROM mimo_influenciadores")).rejects.toThrow();
    await expect(rpc(dados, "d".repeat(64))).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
