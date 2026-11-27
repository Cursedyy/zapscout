import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("separa envios incompletos, controle de acesso e armazenamento privado", async () => {
  const db = new PGlite();
  try {
    const empresa = "10000000-0000-4000-8000-000000000001";
    const envio = "20000000-0000-4000-8000-000000000001";
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE SCHEMA storage;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TYPE public.empresa_papel AS ENUM ('administrador', 'gestor', 'marketing', 'lider_marketing', 'vendedor');
      CREATE TABLE public.empresas (id uuid PRIMARY KEY, slug text, ativa boolean);
      INSERT INTO public.empresas VALUES ('${empresa}', 'mimo', true);
      GRANT SELECT ON public.empresas TO service_role;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit integer, allowed_mime_types text[]);
      CREATE FUNCTION public.tem_papel_empresa(e uuid, u uuid, papeis public.empresa_papel[])
        RETURNS boolean LANGUAGE sql STABLE AS $$
          SELECT e = '${empresa}' AND CASE u
            WHEN '30000000-0000-4000-8000-000000000001' THEN 'marketing'::public.empresa_papel = ANY(papeis)
            WHEN '30000000-0000-4000-8000-000000000002' THEN 'vendedor'::public.empresa_papel = ANY(papeis)
            ELSE false END
        $$;
    `);
    await db.exec(readFileSync("docs/migracoes-preparadas/mimo-campanha-desenhos.sql", "utf8"));
    const reserva = (instagram = "perfil.teste") =>
      db.query<{ resultado: { estado: string } }>(
        "SELECT public.mimo_reservar_desenho($1, $2, 'image/png', 20, repeat('a',64), repeat('b',64)) resultado",
        [envio, instagram],
      );
    const lista = () => db.query("SELECT id, instagram, mime FROM public.mimo_campanha_desenhos");
    const bucket = await db.query("SELECT public, file_size_limit FROM storage.buckets");
    expect(bucket.rows[0]).toEqual({ public: false, file_size_limit: 26214400 });
    await db.exec("SET ROLE anon");
    await expect(reserva()).rejects.toThrow(/permission denied/);
    await expect(lista()).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE; SET ROLE service_role");
    expect((await reserva()).rows[0].resultado.estado).toBe("reservado");
    expect((await reserva("outro.perfil")).rows[0].resultado.estado).toBe("conflito");

    await db.exec(
      "RESET ROLE; SET request.jwt.claim.sub = '30000000-0000-4000-8000-000000000001'; SET ROLE authenticated",
    );
    expect((await lista()).rows).toHaveLength(0);
    await expect(
      db.exec("UPDATE public.mimo_campanha_desenhos SET recebido_em = now()"),
    ).rejects.toThrow(/permission denied/);
    await db.exec(
      "RESET ROLE; SET ROLE service_role; UPDATE public.mimo_campanha_desenhos SET recebido_em = now()",
    );
    expect((await reserva()).rows[0].resultado.estado).toBe("recebido");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    expect((await lista()).rows).toEqual([
      { id: envio, instagram: "perfil.teste", mime: "image/png" },
    ]);
    await db.exec("SET request.jwt.claim.sub = '30000000-0000-4000-8000-000000000002'");
    expect((await lista()).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});
