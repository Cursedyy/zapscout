/**
 * E2E: chamada client-side tentando inserir em `campanha_cron_runs`.
 *
 * O único caminho de escrita nessa tabela em produção é o endpoint público de
 * cron `POST /api/public/hooks/process-campaigns`, que:
 *   - roda `supabaseAdmin` (service_role) — bypassa RLS por design;
 *   - só grava depois de passar por `gateCronHook`, que exige o header
 *     `x-cron-secret` válido.
 *
 * Este teste confirma o modelo de ameaça inteiro:
 *
 *  A) Não existe NENHUMA `createServerFn` client-callable que escreva na
 *     tabela — grep sobre arquivos *.functions.ts em src/. Se um dia alguém criar,
 *     a asserção falha e força a revisão de segurança.
 *
 *  B) O endpoint público sem `x-cron-secret` responde 401 e não grava.
 *
 *  C) O endpoint público com `x-cron-secret` inválido responde 401 e não grava.
 *
 * (B) e (C) só rodam quando `E2E_BASE_URL` está setado (ex: http://localhost:8080
 * em dev, ou a URL publicada em CI). A verificação de "não gravou" só roda
 * quando também há `SUPABASE_SERVICE_ROLE_KEY` — sem ela, o teste ainda
 * valida o status HTTP.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.E2E_BASE_URL;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasHttp = Boolean(BASE_URL);
const hasAdmin = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

const httpDescribe = hasHttp ? describe : describe.skip;

/** Varre recursivamente src/ atrás de arquivos *.functions.ts. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.functions\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("campanha_cron_runs — nenhuma server fn client-callable escreve na tabela", () => {
  it("nenhum *.functions.ts contém insert/update/delete direto em campanha_cron_runs", () => {
    const files = walk(join(process.cwd(), "src"));
    const offenders: { file: string; line: string }[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("campanha_cron_runs")) continue;

      // heurística: qualquer .from("campanha_cron_runs")...(insert|update|delete|upsert)
      // dentro de um arquivo *.functions.ts é potencial exposição client-callable.
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]!.includes("campanha_cron_runs")) continue;
        // olha um bloco de 6 linhas à frente
        const window = lines.slice(i, i + 6).join(" ");
        if (/\.(insert|update|delete|upsert)\s*\(/.test(window)) {
          offenders.push({ file, line: lines[i]!.trim() });
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? `Encontradas escritas em campanha_cron_runs via *.functions.ts:\n${offenders
            .map((o) => `- ${o.file} :: ${o.line}`)
            .join("\n")}`
        : undefined,
    ).toEqual([]);
  });
});

httpDescribe(
  "campanha_cron_runs — endpoint público de cron rejeita chamadas sem segredo",
  () => {
    const url = `${(BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/public/hooks/process-campaigns`;
    const admin = hasAdmin
      ? createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    async function countRunsSince(iso: string): Promise<number> {
      if (!admin) return -1;
      const { count, error } = await admin
        .from("campanha_cron_runs")
        .select("id", { count: "exact", head: true })
        .gte("started_at", iso);
      if (error) throw error;
      return count ?? 0;
    }

    it("POST sem x-cron-secret → 401 e nenhuma linha nova é criada", async () => {
      const since = new Date().toISOString();
      const res = await fetch(url, { method: "POST" });
      expect(res.status).toBe(401);

      if (admin) {
        // pequena folga para eventual gravação assíncrona
        await new Promise((r) => setTimeout(r, 500));
        const after = await countRunsSince(since);
        expect(after).toBe(0);
      }
    });

    it("POST com x-cron-secret inválido → 401 e nenhuma linha nova é criada", async () => {
      const since = new Date().toISOString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-cron-secret": "invalido-e2e-test" },
      });
      expect(res.status).toBe(401);

      if (admin) {
        await new Promise((r) => setTimeout(r, 500));
        const after = await countRunsSince(since);
        expect(after).toBe(0);
      }
    });
  },
);
